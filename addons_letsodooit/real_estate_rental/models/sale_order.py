from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.depends('partner_id.commercial_partner_id.property_account_receivable_id.code')
    def _compute_debitor_number(self):
        for order in self:
            order.debitor_number = order.partner_id.commercial_partner_id.property_account_receivable_id.code

    def _create_debitor_and_creditor_accounts(self, name):
        self.ensure_one()
        IrSequence = self.env['ir.sequence'].with_company(self.company_id)
        debitor_number = IrSequence.next_by_code('real.estate.debitor')
        creditor_number = IrSequence.next_by_code('real.estate.creditor')
        Accounts = self.env['account.account']
        receivable_account = Accounts.create({'code': debitor_number, 'name': name, 'account_type': 'asset_receivable'})
        payable_account = Accounts.create({'code': creditor_number, 'name': name, 'account_type': 'liability_payable'})
        return receivable_account, payable_account

    def _ensure_commercial_entity_has_accounts(self):
        for order in self:
            invoice_address = order.partner_invoice_id.commercial_partner_id
            subunits = self.env['real.estate.building.subunit'].search([
                ('product_id', 'in', self.order_line.product_id.ids)
            ])
            if subunits and not invoice_address.has_generated_real_estate_accounts:
                receivable_account, payable_account = order._create_debitor_and_creditor_accounts(invoice_address.name)
                invoice_address.write({
                    'has_generated_real_estate_accounts': True,
                    'property_account_receivable_id': receivable_account.id,
                    'property_account_payable_id': payable_account.id
                })
        
    def _has_overlapping_subscription(self):
        self.ensure_one()
        subunits = self.env['real.estate.building.subunit'].search([
            ('product_id', 'in', self.order_line.product_id.ids)
        ])
        subunit_products = subunits.product_id
        search_domain = [
            ('id', '!=', self.id),
            ('state', '=', 'sale'),
            ('order_line.product_id', 'in', subunit_products.ids),
            '|',
                ('end_date', '=', False),
                ('end_date', '>=', self.date_order)
        ]
        if self.end_date:
            search_domain.append(('date_order', '<=', self.end_date))
        overlapping_orders = self.search(search_domain)
        return bool(overlapping_orders)

    @api.constrains('state')
    def _check_subunit_is_available(self):
        for order in self:
            if order.state == 'sale' and order._has_overlapping_subscription():
                raise ValidationError(_('At least one subunit is already rented during this period!'))

    def _get_invoiceable_lines(self, final=False):
        result = super()._get_invoiceable_lines(final=final)
        if self.env.context.get('only_invoice_rent_deposit'):
            result = result.filtered(lambda line: line.product_id == self.env.ref('real_estate_rental.product_rent_deposit'))
        return result

    def _try_to_create_invoices(self, grouped=False, final=False, date=None):
        invoices = self.env['account.move'].browse([])
        try:
            invoices += super()._create_invoices(grouped=grouped, final=final, date=date)
        except Exception as e:
            pass
        if invoices:
            invoices.action_post()
        return invoices

    def _create_invoices(self, grouped=False, final=False, date=None):
        """ The double try-except ensures that only an error is thrown if both calls throw an exception. """
        self = self.with_context(only_invoice_rent_deposit=True)
        invoices = self._try_to_create_invoices(grouped=grouped, final=final, date=date)
        self = self.with_context(only_invoice_rent_deposit=False)
        invoices += self._try_to_create_invoices(grouped=grouped, final=final, date=date)
        return invoices

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._ensure_commercial_entity_has_accounts()
        return records

    def write(self, values):
        result = super().write(values)
        self._ensure_commercial_entity_has_accounts()
        return result
