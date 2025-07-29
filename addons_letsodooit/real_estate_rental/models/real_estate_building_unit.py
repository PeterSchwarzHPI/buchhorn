from odoo import api, fields, models, _

class RealEstateBuildingUnit(models.Model):
    _inherit = 'real.estate.building.unit'

    rental_monthly_price = fields.Monetary(
        compute='_compute_rental_monthly_price',
        string='Monthly Rent'
    )

    @api.depends('subunit_ids', 'subunit_ids.rental_monthly_price')
    def _compute_rental_monthly_price(self):
        for unit in self:
            unit.rental_monthly_price = sum(unit.subunit_ids.mapped('rental_monthly_price'))
