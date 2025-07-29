from odoo import api, fields, models, _

class RealEstateAnalyticMixin(models.AbstractModel):
    _name = 'real.estate.analytic.mixin'
    _description  = 'Real Estate Analytic Mixin'

    analytic_account_id = fields.Many2one(
        comodel_name='account.analytic.account',
        string='Analytic Account'
    )

    @property
    def plan_id(self):
        raise NotImplementedError

    def _get_analytic_account_values(self):
        self.ensure_one()
        return {
            'name': self.name,
            'plan_id': self.plan_id
        }

    def _create_analytic_account(self):
        self.ensure_one()
        analytic_account_values = self._get_analytic_account_values()
        analytic_account = self.env['account.analytic.account'].create(analytic_account_values)
        super().write({'analytic_account_id': analytic_account.id})

    def _create_or_update_analytic_account(self):
        for record in self:
            if not record.analytic_account_id:
                record._create_analytic_account()
            else:
                record.analytic_account_id.write({'name': record.name})

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._create_or_update_analytic_account()
        return records

    def write(self, values):
        result = super().write(values)
        self._create_or_update_analytic_account()
        return result
