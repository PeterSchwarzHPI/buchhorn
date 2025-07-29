from odoo import api, fields, models, _

class ResPartner(models.Model):
    _inherit = 'res.partner'

    has_generated_real_estate_accounts = fields.Boolean(
        default=False
    )
