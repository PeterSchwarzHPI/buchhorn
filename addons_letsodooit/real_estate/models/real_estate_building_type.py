from odoo import api, fields, models, _

class RealEstateBuildingType(models.Model):
    _name = 'real.estate.building.type'
    _description = 'Real Estate Building Type'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
