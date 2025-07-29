from odoo import api, fields, models, _

class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    date_order = fields.Datetime(
        related='order_id.date_order'
    )
    end_date = fields.Date(
        related='order_id.end_date'
    )

    @api.model
    def get_gantt_data(self, domain, groupby, read_specification, **kwargs):
        result = super().get_gantt_data(domain, groupby, read_specification, **kwargs)
        if 'product_id' in groupby and len(groupby) == 1:
            existing_product_ids = [group['product_id'][0] for group in result['groups']]
            all_products = self.env['product.product'].search([
                ('recurring_invoice', '=', True)
            ])
            for product in all_products:
                if product.id not in existing_product_ids:
                    result['groups'].append({
                        'product_id': (product.id, product.name)
                    })
        return result
