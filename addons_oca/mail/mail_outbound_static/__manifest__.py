# Copyright 2016-2022 LasLabs Inc.
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).

{
    "name": "Mail Outbound Static",
    "summary": "Allows you to configure the from header for a mail server.",
    "version": "18.0.1.0.1",
    "category": "Discuss",
    "website": "https://github.com/OCA/mail",
    "author": "braintec AG, LasLabs, Adhoc SA, Odoo Community Association (OCA)",
    "license": "LGPL-3",
    "application": False,
    "installable": True,
    "depends": ["base"],
    "data": ["views/ir_mail_server_view.xml"],
}
