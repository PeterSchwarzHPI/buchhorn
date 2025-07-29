from odoo import api, fields, models, _

class RealEstateBuilding(models.Model):
    _inherit = 'real.estate.building'

    rental_monthly_price = fields.Monetary(
        compute='_compute_rental_monthly_price',
        string='Monthly Rent'
    )

    @api.depends('unit_ids', 'unit_ids.rental_monthly_price')
    def _compute_rental_monthly_price(self):
        for building in self:
            building.rental_monthly_price = sum(building.unit_ids.mapped('rental_monthly_price'))
