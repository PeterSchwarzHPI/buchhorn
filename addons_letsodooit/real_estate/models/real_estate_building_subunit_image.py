from odoo import api, fields, models, _

class RealEstateBuildingSubunitImage(models.Model):
    _name = 'real.estate.building.subunit.image'
    _description = 'Real Estate Building Subunit Image'
    _inherit = 'image.mixin'

    subunit_id = fields.Many2one(
        comodel_name='real.estate.building.subunit',
        required=True
    )
    sequence = fields.Integer()
