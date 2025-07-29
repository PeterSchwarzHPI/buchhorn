from odoo import api, fields, models, _

class RealEstateBuildingSubunit(models.Model):
    _inherit = 'real.estate.building.subunit'

    product_id = fields.Many2one(
        comodel_name='product.product',
        string="Product"
    )
    rental_prices = fields.One2many(
        comodel_name='sale.subscription.pricing',
        related='product_id.product_subscription_pricing_ids',
        related_sudo=True
    )
    rental_monthly_price = fields.Monetary(
        compute='_compute_rental_monthly_price',
        string='Monthly Rent'
    )
    analytic_distribution_model_id = fields.Many2one(
        comodel_name='account.analytic.distribution.model',
        string='Analytic Distribution Model'
    )

    @api.depends('rental_prices', 'rental_prices.price', 'rental_prices.plan_id')
    def _compute_rental_monthly_price(self):
        for subunit in self:
            monthly_prices = subunit.rental_prices.filtered(lambda pricing: pricing.plan_id.billing_period_unit == 'month')
            price = .0
            if monthly_prices:
                price = monthly_prices[0].price
            subunit.rental_monthly_price = price

    def _get_product_values(self):
        self.ensure_one()
        return {
            'sale_ok': True,
            'purchase_ok': False,
            'recurring_invoice': True,
            'type': 'service',
            'name': self.name
        }

    def _create_or_update_product(self):
        for subunit in self:
            if not subunit.product_id:
                product_values = subunit._get_product_values()
                product = self.env['product.product'].create(product_values)
                subunit.write({'product_id': product.id})
            else:
                subunit.product_id.write({'name': subunit.name})

    def _get_analytic_distribution_values(self):
        self.ensure_one()
        analytic_distribution = {}
        analytic_accounts = [self, self.unit_id, self.building_id]
        for analytic_account in analytic_accounts:
            analytic_distribution[str(analytic_account.analytic_account_id.id)] = 100.0
        return {
            'product_id': self.product_id.id,
            'analytic_distribution': analytic_distribution
        }

    def _update_analytic_distribution(self, unlink_only=False):
        self.analytic_distribution_model_id.unlink()
        if unlink_only:
            return
        for subunit in self:
            analytic_distribution_values = subunit._get_analytic_distribution_values()
            analytic_distribution = self.env['account.analytic.distribution.model'].create(analytic_distribution_values)
            super(RealEstateBuildingSubunit, subunit).write({'analytic_distribution_model_id': analytic_distribution.id})

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._create_or_update_product()
        records._update_analytic_distribution()
        return records

    def write(self, values):
        result = super().write(values)
        self._create_or_update_product()
        self._update_analytic_distribution()
        return result

    def unlink(self):
        products = self.product_id
        self._update_analytic_distribution(unlink_only=True)
        result = super().unlink()
        products.toggle_active()
        return result
