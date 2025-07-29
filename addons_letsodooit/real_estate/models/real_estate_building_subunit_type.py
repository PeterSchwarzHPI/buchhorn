from odoo import api, fields, models, _

class RealEstateBuildingSubunitType(models.Model):
    _name = 'real.estate.building.subunit.type'
    _description = 'Real Estate Building Subunit Type'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
