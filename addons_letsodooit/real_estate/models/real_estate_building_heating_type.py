from odoo import api, fields, models, _

class RealEstateBuildingHeatingType(models.Model):
    _name = 'real.estate.building.heating_type'
    _description = 'Real Estate Building Heating Type'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
