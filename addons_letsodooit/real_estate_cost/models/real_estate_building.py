from odoo import api, fields, models, _

class RealEstateBuilding(models.Model):
    _inherit = 'real.estate.building'

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
        store=True
    )
    rental_cost_per_sqm = fields.Monetary(
        compute='_compute_rental_cost',
        store=True
    )
    heating_cost = fields.Monetary(
        compute='_compute_heating_cost',
        store=True
    )
    heating_cost_per_sqm = fields.Monetary(
        compute='_compute_heating_cost',
        store=True
    )
    electricity_cost = fields.Monetary(
        compute='_compute_electricity_cost',
        store=True
    )
    electricity_cost_per_sqm = fields.Monetary(
        compute='_compute_electricity_cost',
        store=True
    )
    additional_cost = fields.Monetary(
        compute='_compute_additional_cost',
        store=True
    )
    additional_cost_per_sqm = fields.Monetary(
        compute='_compute_additional_cost',
        store=True
    )

    def _get_cost_per_sqm(self, cost):
        self.ensure_one()
        square_meter = sum(self.unit_ids.mapped('square_meter')) or 1.0
        return cost / square_meter

    def _get_cost_sums_for(self, field_name):
        self.ensure_one()
        cost = sum(self.unit_ids.mapped(field_name))
        return cost, self._get_cost_per_sqm(cost)

    @api.depends('rental_cost', 'heating_cost', 'electricity_cost', 'additional_cost', 'unit_ids.square_meter')
    def _compute_cost(self):
        for building in self:
            building.cost = building.rental_cost + building.heating_cost + building.electricity_cost + building.additional_cost
            building.cost_per_sqm = building._get_cost_per_sqm(building.cost)

    @api.depends('unit_ids.rental_cost', 'unit_ids.square_meter')
    def _compute_rental_cost(self):
        for building in self:
            cost, cost_per_sqm = building._get_cost_sums_for('rental_cost')
            building.rental_cost = cost
            building.rental_cost_per_sqm = cost_per_sqm

    @api.depends('unit_ids.heating_cost', 'unit_ids.square_meter')
    def _compute_heating_cost(self):
        for building in self:
            cost, cost_per_sqm = building._get_cost_sums_for('heating_cost')
            building.heating_cost = cost
            building.heating_cost_per_sqm = cost_per_sqm

    @api.depends('unit_ids.electricity_cost', 'unit_ids.square_meter')
    def _compute_electricity_cost(self):
        for building in self:
            cost, cost_per_sqm = building._get_cost_sums_for('electricity_cost')
            building.electricity_cost = cost
            building.electricity_cost_per_sqm = cost_per_sqm

    @api.depends('unit_ids.additional_cost', 'unit_ids.square_meter')
    def _compute_additional_cost(self):
        for building in self:
            cost, cost_per_sqm = building._get_cost_sums_for('additional_cost')
            building.additional_cost = cost
            building.additional_cost_per_sqm = cost_per_sqm
