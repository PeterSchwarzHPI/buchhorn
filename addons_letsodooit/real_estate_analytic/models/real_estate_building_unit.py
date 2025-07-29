from odoo import api, fields, models, _

class RealEstateBuildingUnit(models.AbstractModel):
    _name = 'real.estate.building.unit'
    _inherit = ['real.estate.building.unit', 'real.estate.analytic.mixin']

    @property
    def plan_id(self):
        return self.env.ref('real_estate_analytic.analytic_plan_real_estate_units').id
