from odoo import api, fields, models, _

class MailMessage(models.Model):
    _inherit = 'mail.message'

    @api.model_create_multi
    def create(self, values_list):
        for values in values_list:
            if not values.get('mail_server_id') and values.get('subtype_id') == self.env.ref('mail.mt_comment').id:
                mail_server = self.env['ir.mail_server'].sudo().search([], limit=1)
                if mail_server:
                    values['mail_server_id'] = mail_server.id
                    if mail_server.smtp_from:
                        values['reply_to'] = '"%s" <%s>' % (self.env.company.name, mail_server.smtp_from)
        return super().create(values_list)
