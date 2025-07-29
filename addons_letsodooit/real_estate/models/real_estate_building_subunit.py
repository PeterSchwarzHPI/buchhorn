from odoo import api, fields, models, _

class RealEstateBuildingSubunit(models.Model):
    _name = 'real.estate.building.subunit'
    _description = 'Real Estate Building Subunit'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char(
        required=True
    )
    subunit_type = fields.Many2one(
        comodel_name='real.estate.building.subunit.type',
        name='Subunit Type'
    )
    unit_number = fields.Char(
        string='Unit Number'
    )
    last_modernisation = fields.Integer(
        string='Last Modernisation'
    )
    floor_number = fields.Float(
        string='Floor Number',
        digits='Room Count'
    )
    number_of_rooms = fields.Float(
        string='Number of Rooms',
        digits='Room Count'
    )
    number_of_bedrooms = fields.Float(
        string='Number of Bedrooms',
        digits='Room Count'
    )
    number_of_bathrooms = fields.Float(
        string='Number of Bathrooms',
        digits='Room Count'
    )
    square_meter = fields.Float(
        string='Square Meter',
        digits='Area',
        required=True
    )
    owner_id = fields.Many2one(
        comodel_name='res.partner',
        string='Owner'
    )
    unit_id = fields.Many2one(
        comodel_name='real.estate.building.unit',
        string='Unit',
        required=True
    )
    building_id = fields.Many2one(
        comodel_name='real.estate.building',
        related='unit_id.building_id',
        string='Building'
    )
    currency_id = fields.Many2one(
        comodel_name='res.currency',
        related='unit_id.currency_id',
        string='Currency'
    )
    image_ids = fields.One2many(
        comodel_name='real.estate.building.subunit.image',
        inverse_name='subunit_id'
    )
    company_id = fields.Many2one(
        related='building_id.company_id'
    )
