# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import re

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, RedirectWarning, UserError
from odoo.tools.image import image_data_uri


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_in_gst_treatment = fields.Selection([
            ('regular', 'Registered Business - Regular'),
            ('composition', 'Registered Business - Composition'),
            ('unregistered', 'Unregistered Business'),
            ('consumer', 'Consumer'),
            ('overseas', 'Overseas'),
            ('special_economic_zone', 'Special Economic Zone'),
            ('deemed_export', 'Deemed Export'),
            ('uin_holders', 'UIN Holders'),
        ], string="GST Treatment", compute="_compute_l10n_in_gst_treatment", store=True, readonly=False, copy=True, precompute=True)
    l10n_in_state_id = fields.Many2one('res.country.state', string="Place of supply",
        compute="_compute_l10n_in_state_id", store=True, readonly=False, precompute=True)
    l10n_in_gstin = fields.Char(string="GSTIN")
    # For Export invoice this data is need in GSTR report
    l10n_in_shipping_bill_number = fields.Char('Shipping bill number')
    l10n_in_shipping_bill_date = fields.Date('Shipping bill date')
    l10n_in_shipping_port_code_id = fields.Many2one('l10n_in.port.code', 'Port code')
    l10n_in_reseller_partner_id = fields.Many2one('res.partner', 'Reseller', domain=[('vat', '!=', False)], help="Only Registered Reseller")
    l10n_in_journal_type = fields.Selection(string="Journal Type", related='journal_id.type')
    l10n_in_warning = fields.Json(compute="_compute_l10n_in_warning")

    @api.depends('partner_id', 'partner_id.l10n_in_gst_treatment')
    def _compute_l10n_in_gst_treatment(self):
        indian_invoice = self.filtered(lambda m: m.country_code == 'IN')
        for record in indian_invoice:
            if record.state == 'draft':
                gst_treatment = record.partner_id.l10n_in_gst_treatment
                if not gst_treatment:
                    gst_treatment = 'unregistered'
                    if record.partner_id.country_id.code == 'IN' and record.partner_id.vat:
                        gst_treatment = 'regular'
                    elif record.partner_id.country_id and record.partner_id.country_id.code != 'IN':
                        gst_treatment = 'overseas'
                record.l10n_in_gst_treatment = gst_treatment
        (self - indian_invoice).l10n_in_gst_treatment = False

    @api.depends('partner_id', 'partner_shipping_id', 'company_id')
    def _compute_l10n_in_state_id(self):
        foreign_state = self.env.ref('l10n_in.state_in_oc', raise_if_not_found=False)
        for move in self:
            if move.country_code == 'IN' and move.is_sale_document(include_receipts=True):
                partner = (
                    move.partner_id.commercial_partner_id == move.partner_shipping_id.commercial_partner_id
                    and move.partner_shipping_id
                    or move.partner_id
                )
                if partner.country_id and partner.country_id.code != 'IN':
                    move.l10n_in_state_id = foreign_state
                    continue
                partner_state = partner.state_id or move.partner_id.commercial_partner_id.state_id or move.company_id.state_id
                country_code = partner_state.country_id.code or move.country_code
                move.l10n_in_state_id = partner_state if country_code == 'IN' else foreign_state
            elif move.country_code == 'IN' and move.journal_id.type == 'purchase':
                move.l10n_in_state_id = move.company_id.state_id
            else:
                move.l10n_in_state_id = False

    @api.depends('l10n_in_state_id', 'l10n_in_gst_treatment')
    def _compute_fiscal_position_id(self):

        def _get_fiscal_state(move, foreign_state):
            """
            Maps each move to its corresponding fiscal state based on its type,
            fiscal conditions, and the state of the associated partner or company.
            """

            if (
                move.country_code != 'IN'
                or not move.is_invoice(include_receipts=True)
                # Partner's FP takes precedence through super
                or move.partner_shipping_id.property_account_position_id
                or move.partner_id.property_account_position_id
            ):
                return False
            elif move.l10n_in_gst_treatment == 'special_economic_zone':
                # Special Economic Zone
                return foreign_state
            elif move.is_sale_document(include_receipts=True):
                # In Sales Documents: Compare place of supply with company state
                return move.l10n_in_state_id if move.l10n_in_state_id.l10n_in_tin != '96' else foreign_state
            elif move.is_purchase_document(include_receipts=True) and move.partner_id.country_id.code == 'IN':
                # In Purchases Documents: Compare place of supply with vendor state
                pos_state_id = move.l10n_in_state_id
                if pos_state_id.l10n_in_tin == '96':
                    return foreign_state
                elif pos_state_id == move.partner_id.state_id:
                    # Intra-State: Group by state matching the company's state.
                    return move.company_id.state_id
                elif pos_state_id != move.partner_id.state_id:
                    # Inter-State: Group by state that doesn't match the company's state.
                    return (
                        pos_state_id == move.company_id.state_id
                        and move.partner_id.state_id
                        or pos_state_id
                    )
            return False

        FiscalPosition = self.env['account.fiscal.position']
        # To avoid ORM call in loops, we are passing the `foreign_state` as parameter
        foreign_state = self.env['res.country.state'].search([('code', '!=', 'IN')], limit=1)
        for state_id, moves in self.grouped(lambda move: _get_fiscal_state(move, foreign_state)).items():
            if state_id:
                virtual_partner = self.env['res.partner'].new({
                    'state_id': state_id.id,
                    'country_id': state_id.country_id.id,
                })
                # Group moves by company to avoid multi-company conflicts
                for company_id, company_moves in moves.grouped('company_id').items():
                    company_moves.fiscal_position_id = FiscalPosition.with_company(
                        company_id
                    )._get_fiscal_position(virtual_partner)
            else:
                super(AccountMove, moves)._compute_fiscal_position_id()

    @api.onchange('name')
    def _onchange_name_warning(self):
        if self.country_code == 'IN' and self.journal_id.type == 'sale' and self.name and (len(self.name) > 16 or not re.match(r'^[a-zA-Z0-9-\/]+$', self.name)):
            return {'warning': {
                'title' : _("Invalid sequence as per GST rule 46(b)"),
                'message': _(
                    "The invoice number should not exceed 16 characters\n"
                    "and must only contain '-' (hyphen) and '/' (slash) as special characters"
                )
            }}
        return super()._onchange_name_warning()

    @api.depends('invoice_line_ids.l10n_in_hsn_code', 'company_id.l10n_in_hsn_code_digit')
    def _compute_l10n_in_warning(self):

        def build_warning(record, action_name, message, views, domain=False):
            return {
                'message': message,
                'action_text': self.env._("View %s", action_name),
                'action': record._get_records_action(name=self.env._("Check %s", action_name), target='current', views=views, domain=domain or [])
            }

        indian_invoice = self.filtered(lambda m: m.country_code == 'IN' and m.move_type != 'entry')
        for move in indian_invoice:
            filtered_lines = move.invoice_line_ids.filtered(lambda line: line.display_type == 'product' and line.tax_ids and line._origin)
            if move.company_id.l10n_in_hsn_code_digit and filtered_lines:
                lines = self.env['account.move.line']
                for line in filtered_lines:
                    if (line.l10n_in_hsn_code and (not re.match(r'^\d{4}$|^\d{6}$|^\d{8}$', line.l10n_in_hsn_code) or len(line.l10n_in_hsn_code) < int(move.company_id.l10n_in_hsn_code_digit))) or not line.l10n_in_hsn_code:
                        lines |= line._origin

                digit_suffixes = {
                    '4': _("4 digits, 6 digits or 8 digits"),
                    '6': _("6 digits or 8 digits"),
                    '8': _("8 digits")
                }
                msg = _("Ensure that the HSN/SAC Code consists either %s in invoice lines",
                    digit_suffixes.get(move.company_id.l10n_in_hsn_code_digit, _("Invalid HSN/SAC Code digit"))
                )
                move.l10n_in_warning = {
                    'invalid_hsn_code_length': build_warning(
                        message=msg,
                        action_name=_("Journal Items(s)"),
                        record=lines,
                        views=[(self.env.ref("l10n_in.view_move_line_tree_hsn_l10n_in").id, "list")],
                        domain=[('id', 'in', lines.ids)]
                    )
                } if lines else {}
            else:
                move.l10n_in_warning = {}
        (self - indian_invoice).l10n_in_warning = {}

    def _get_name_invoice_report(self):
        self.ensure_one()
        if self.country_code == 'IN':
            return 'l10n_in.l10n_in_report_invoice_document_inherit'
        return super()._get_name_invoice_report()

    def _post(self, soft=True):
        """Use journal type to define document type because not miss state in any entry including POS entry"""
        posted = super()._post(soft)
        gst_treatment_name_mapping = {k: v for k, v in
                             self._fields['l10n_in_gst_treatment']._description_selection(self.env)}
        for move in posted.filtered(lambda m: m.country_code == 'IN' and m.is_sale_document()):
            if move.l10n_in_state_id and not move.l10n_in_state_id.l10n_in_tin:
                raise UserError(_("Please set a valid TIN Number on the Place of Supply %s", move.l10n_in_state_id.name))
            if not move.company_id.state_id:
                msg = _("Your company %s needs to have a correct address in order to validate this invoice.\n"
                "Set the address of your company (Don't forget the State field)", move.company_id.name)
                action = {
                    "view_mode": "form",
                    "res_model": "res.company",
                    "type": "ir.actions.act_window",
                    "res_id" : move.company_id.id,
                    "views": [[self.env.ref("base.view_company_form").id, "form"]],
                }
                raise RedirectWarning(msg, action, _('Go to Company configuration'))
            move.l10n_in_gstin = move.partner_id.vat
            if not move.l10n_in_gstin and move.l10n_in_gst_treatment in ['regular', 'composition', 'special_economic_zone', 'deemed_export']:
                raise ValidationError(_(
                    "Partner %(partner_name)s (%(partner_id)s) GSTIN is required under GST Treatment %(name)s",
                    partner_name=move.partner_id.name,
                    partner_id=move.partner_id.id,
                    name=gst_treatment_name_mapping.get(move.l10n_in_gst_treatment)
                ))
        return posted

    def _l10n_in_get_warehouse_address(self):
        """Return address where goods are delivered/received for Invoice/Bill"""
        # TO OVERRIDE
        self.ensure_one()
        return False

    def _can_be_unlinked(self):
        self.ensure_one()
        return (self.country_code != 'IN' or not self.posted_before) and super()._can_be_unlinked()

    def _generate_qr_code(self, silent_errors=False):
        self.ensure_one()
        if self.company_id.country_code == 'IN' and self.company_id.l10n_in_upi_id:
            payment_url = 'upi://pay?pa=%s&pn=%s&am=%s&tr=%s&tn=%s' % (
                self.company_id.l10n_in_upi_id,
                self.company_id.name,
                self.amount_residual,
                self.payment_reference or self.name,
                ("Payment for %s" % self.name))
            barcode = self.env['ir.actions.report'].barcode(barcode_type="QR", value=payment_url, width=120, height=120)
            return image_data_uri(base64.b64encode(barcode))
        return super()._generate_qr_code(silent_errors)

    def _l10n_in_get_hsn_summary_table(self):
        self.ensure_one()
        base_lines, _tax_lines = self._get_rounded_base_and_tax_lines()
        display_uom = self.env.user.has_group('uom.group_uom')
        return self.env['account.tax']._l10n_in_get_hsn_summary_table(base_lines, display_uom)
