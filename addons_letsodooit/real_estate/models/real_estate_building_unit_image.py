from odoo import api, fields, models, _

class RealEstateBuildingUnitImage(models.Model):
    _name = 'real.estate.building.unit.image'
    _description = 'Real Estate Building Unit Image'
    _inherit = 'image.mixin'

    unit_id = fields.Many2one(
        comodel_name='real.estate.building.unit',
        required=True
    )
    sequence = fields.Integer()
