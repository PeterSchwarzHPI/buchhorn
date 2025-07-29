from odoo import api, fields, models, _

class RealEstateBuildingUnit(models.Model):
    _name = 'real.estate.building.unit'
    _description = 'Real Estate Building Unit'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char(
        required=True
    )
    level_of_retrofit = fields.Many2one(
        comodel_name='real.estate.building.level_of_retrofit',
        string='Level of Retrofit'
    )
    building_type = fields.Many2one(
        comodel_name='real.estate.building.type',
        string='Building Type'
    )
    unit_type = fields.Many2one(
        comodel_name='real.estate.building.unit.type',
        string='Unit Type'
    )
    building_area = fields.Float(
        string='Building Area',
        digits='Area'
    )
    sealed_area = fields.Float(
        string='Sealed Area',
        digits='Area'
    )
    roof_area = fields.Float(
        string='Roof Area',
        digits='Area'
    )
    window_area = fields.Float(
        string='Window Area',
        digits='Area'
    )
    corridor_area = fields.Float(
        string='Corridor Area',
        digits='Area'
    )
    gross_area = fields.Float(
        string='Gross Area',
        digits='Area'
    )
    year_of_construction = fields.Integer(
        string='Year of Construction'
    )
    number_of_floors = fields.Float(
        string='Number of Floors',
        digits='Room Count'
    )
    number_of_windows = fields.Float(
        string='Number of Windows',
        digits='Room Count'
    )
    number_of_cellar_rooms = fields.Float(
        string='Number of Cellar Rooms',
        digits='Room Count'
    )
    has_elevator = fields.Boolean(
        string='Has Elevator'
    )
    has_monument_protection = fields.Boolean(
        string='Has Monument Protection'
    )
    heating_type = fields.Many2one(
        comodel_name='real.estate.building.heating_type',
        string='Heating Type'
    )
    building_id = fields.Many2one(
        comodel_name='real.estate.building',
        string='Building',
        required=True
    )
    currency_id = fields.Many2one(
        comodel_name='res.currency',
        related='building_id.currency_id',
        string='Currency'
    )
    subunit_ids = fields.One2many(
        comodel_name='real.estate.building.subunit',
        inverse_name='unit_id',
        string='Subunits'
    )
    subunit_count = fields.Integer(
        compute='_compute_subunit_count',
        string='Subunit Count',
        store=True
    )
    image_ids = fields.One2many(
        comodel_name='real.estate.building.unit.image',
        inverse_name='unit_id'
    )
    company_id = fields.Many2one(
        related='building_id.company_id'
    )
    street = fields.Char()
    zip = fields.Char()
    city = fields.Char()

    @api.depends('subunit_ids')
    def _compute_subunit_count(self):
        for unit in self:
            unit.subunit_count = len(unit.subunit_ids)
