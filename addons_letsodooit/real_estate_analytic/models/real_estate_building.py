from odoo import api, fields, models, _

class RealEstateBuilding(models.AbstractModel):
    _name = 'real.estate.building'
    _inherit = ['real.estate.building', 'real.estate.analytic.mixin']

    @property
    def plan_id(self):
        return self.env.ref('real_estate_analytic.analytic_plan_real_estate_buildings').id
