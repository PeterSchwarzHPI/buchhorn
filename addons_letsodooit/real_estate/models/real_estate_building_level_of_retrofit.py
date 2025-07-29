from odoo import api, fields, models, _

class RealEstateBuildingLevelOfRetrofit(models.Model):
    _name = 'real.estate.building.level_of_retrofit'
    _description = 'Real Estate Building Level of Retrofit'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
