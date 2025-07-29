from odoo import api, fields, models, _

class RealEstateBuildingUnit(models.Model):
    _inherit = 'real.estate.building.unit'

    cost = fields.Monetary(
        compute='_compute_cost',
        store=True
    )
    cost_per_sqm = fields.Monetary(
        compute='_compute_cost',
        store=True
    )
    rental_cost = fields.Monetary(
        compute='_compute_rental_cost',
        store=True,
        readonly=False
    )
    rental_cost_per_sqm = fields.Monetary(
        compute='_compute_rental_cost_per_sqm',
        store=True,
        readonly=False
    )
    heating_cost = fields.Monetary(
        compute='_compute_heating_cost',
        store=True,
        readonly=False
    )
    heating_cost_per_sqm = fields.Monetary(
        compute='_compute_heating_cost_per_sqm',
        store=True,
        readonly=False
    )
    electricity_cost = fields.Monetary(
        compute='_compute_electricity_cost',
        store=True,
        readonly=False
    )
    electricity_cost_per_sqm = fields.Monetary(
        compute='_compute_electricity_cost_per_sqm',
        store=True,
        readonly=False
    )
    additional_cost = fields.Monetary(
        compute='_compute_additional_cost',
        store=True,
        readonly=False
    )
    additional_cost_per_sqm = fields.Monetary(
        compute='_compute_additional_cost_per_sqm',
        store=True,
        readonly=False
    )

    def _get_cost_per_sqm(self, cost):
        self.ensure_one()
        return cost / (self.square_meter or 1.0)

    def _get_cost_from_sqm(self, cost_per_sqm):
        self.ensure_one()
        return cost_per_sqm * self.square_meter

    @api.depends('rental_cost', 'heating_cost', 'electricity_cost', 'additional_cost')
    def _compute_cost(self):
        for unit in self:
            unit.cost = unit.rental_cost + unit.heating_cost + unit.electricity_cost + unit.additional_cost
            unit.cost_per_sqm = unit._get_cost_per_sqm(unit.cost)

    @api.depends('rental_cost_per_sqm', 'square_meter')
    def _compute_rental_cost(self):
        for unit in self:
            unit.rental_cost = unit._get_cost_from_sqm(self.rental_cost_per_sqm)

    @api.depends('rental_cost', 'square_meter')
    def _compute_rental_cost_per_sqm(self):
        for unit in self:
            unit.rental_cost_per_sqm = unit._get_cost_per_sqm(self.rental_cost)

    @api.depends('heating_cost_per_sqm', 'square_meter')
    def _compute_heating_cost(self):
        for unit in self:
            unit.heating_cost = unit._get_cost_from_sqm(self.heating_cost_per_sqm)

    @api.depends('heating_cost', 'square_meter')
    def _compute_heating_cost_per_sqm(self):
        for unit in self:
            unit.heating_cost_per_sqm = unit._get_cost_per_sqm(self.heating_cost)

    @api.depends('electricity_cost_per_sqm', 'square_meter')
    def _compute_electricity_cost(self):
        for unit in self:
            unit.electricity_cost = unit._get_cost_from_sqm(self.electricity_cost_per_sqm)

    @api.depends('electricity_cost', 'square_meter')
    def _compute_electricity_cost_per_sqm(self):
        for unit in self:
            unit.electricity_cost_per_sqm = unit._get_cost_per_sqm(self.electricity_cost)

    @api.depends('additional_cost_per_sqm', 'square_meter')
    def _compute_additional_cost(self):
        for unit in self:
            unit.additional_cost = unit._get_cost_from_sqm(self.additional_cost_per_sqm)

    @api.depends('additional_cost', 'square_meter')
    def _compute_additional_cost_per_sqm(self):
        for unit in self:
            unit.additional_cost_per_sqm = unit._get_cost_per_sqm(self.additional_cost)
