from odoo import api, fields, models, _

class RealEstateBuildingSubunit(models.AbstractModel):
    _name = 'real.estate.building.subunit'
    _inherit = ['real.estate.building.subunit', 'real.estate.analytic.mixin']

    @property
    def plan_id(self):
        return self.env.ref('real_estate_analytic.analytic_plan_real_estate_subunits').id
