from odoo import api, fields, models, _

class RealEstateBuilding(models.Model):
    _name = 'real.estate.building'
    _description = 'Real Estate Building'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char()
    unit_type = fields.Many2one(
        comodel_name='real.estate.building.unit.type',
        string='Unit Type'
    )
    corridor = fields.Char()
    corridor_piece = fields.Char()
    building_area = fields.Float(
        string='Building Area',
        digits='Area'
    )
    undeveloped_area = fields.Float(
        string='Undeveloped Area',
        digits='Area'
    )
    sealed_area = fields.Float(
        string='Sealed Area',
        digits='Area'
    )
    unit_ids = fields.One2many(
        comodel_name='real.estate.building.unit',
        inverse_name='building_id',
        string='Units'
    )
    unit_count = fields.Integer(
        compute='_compute_unit_count',
        string='Unit Count',
        store=True
    )
    currency_id = fields.Many2one(
        comodel_name='res.currency',
        string='Currency'
    )
    company_id = fields.Many2one(
        comodel_name='res.company',
        required=True, index=True,
        default=lambda self: self.env.company
    )

    @api.depends('unit_ids')
    def _compute_unit_count(self):
        for building in self:
            building.unit_count = len(building.unit_ids)
