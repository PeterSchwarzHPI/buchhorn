from odoo import api, fields, models, _

class RealEstateBuildingSubunit(models.Model):
    _inherit = 'real.estate.building.subunit'

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
        compute='_compute_rental_cost_per_sqm',
        store=True
    )
    heating_cost = fields.Monetary(
        compute='_compute_heating_cost',
        store=True
    )
    heating_cost_per_sqm = fields.Monetary(
        compute='_compute_heating_cost_per_sqm',
        store=True
    )
    electricity_cost = fields.Monetary(
        compute='_compute_electricity_cost',
        store=True
    )
    electricity_cost_per_sqm = fields.Monetary(
        compute='_compute_electricity_cost_per_sqm',
        store=True
    )
    additional_cost = fields.Monetary(
        compute='_compute_additional_cost',
        store=True
    )
    additional_cost_per_sqm = fields.Monetary(
        compute='_compute_additional_cost_per_sqm',
        store=True
    )

    def _get_cost_per_sqm(self, cost):
        self.ensure_one()
        return cost / (self.square_meter or 1.0)

    def _get_cost_sums_for(self, field_name):
        self.ensure_one()
        cost_unit_per_sqm = self.unit_id[field_name] / (self.unit_id.square_meter or 1.0)
        cost = cost_unit_per_sqm * self.square_meter
        return cost, cost_unit_per_sqm

    @api.depends('rental_cost', 'heating_cost', 'electricity_cost', 'additional_cost')
    def _compute_cost(self):
        for subunit in self:
            subunit.cost = subunit.rental_cost + subunit.heating_cost + subunit.electricity_cost + subunit.additional_cost
            subunit.cost_per_sqm = subunit._get_cost_per_sqm(subunit.cost)

    @api.depends('unit_id.rental_cost', 'unit_id.square_meter', 'square_meter')
    def _compute_rental_cost(self):
        for subunit in self:
            cost, cost_per_sqm = subunit._get_cost_sums_for('rental_cost')
            subunit.rental_cost = cost
            subunit.rental_cost_per_sqm = cost_per_sqm

    @api.depends('unit_id.heating_cost', 'unit_id.square_meter', 'square_meter')
    def _compute_heating_cost(self):
        for subunit in self:
            cost, cost_per_sqm = subunit._get_cost_sums_for('heating_cost')
            subunit.heating_cost = cost
            subunit.heating_cost_per_sqm = cost_per_sqm

    @api.depends('unit_id.electricity_cost', 'unit_id.square_meter', 'square_meter')
    def _compute_electricity_cost(self):
        for subunit in self:
            cost, cost_per_sqm = subunit._get_cost_sums_for('electricity_cost')
            subunit.electricity_cost = cost
            subunit.electricity_cost_per_sqm = cost_per_sqm

    @api.depends('unit_id.additional_cost', 'unit_id.square_meter', 'square_meter')
    def _compute_additional_cost(self):
        for subunit in self:
            cost, cost_per_sqm = subunit._get_cost_sums_for('additional_cost')
            subunit.additional_cost = cost
            subunit.additional_cost_per_sqm = cost_per_sqm
