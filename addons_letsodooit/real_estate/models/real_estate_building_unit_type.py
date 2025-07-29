from odoo import api, fields, models, _

class RealEstateBuildingUnitType(models.Model):
    _name = 'real.estate.building.unit.type'
    _description = 'Real Estate Building Unit Type'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
