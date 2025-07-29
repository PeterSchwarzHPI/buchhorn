from odoo import api, fields, models, _

class RealEstateBuilding(models.Model):
    _inherit = 'real.estate.building'

    project_id = fields.Many2one(
        comodel_name='project.project',
        string='Project'
    )
