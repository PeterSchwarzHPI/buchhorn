{
    "name": "Real Estate (Rental)",
    "version": "18.0.1.0.1",
    "category": "Others",
    "summary": "This module allows to manage rentals of buildings, units and subunits.""",
    "website": "https://peter-schwarz.it/",
    "author": "Peter Schwarz (info@peter-schwarz.it)",
    "license": "AGPL-3",
    "depends": [
        "real_estate_analytic",
        "sale_subscription",
        "web_gantt"
    ],
    "data": [
        "data/ir_sequence_data.xml",
        "data/product_data.xml",
        "views/real_estate_building_views.xml",
        "views/real_estate_building_unit_views.xml",
        "views/real_estate_building_subunit_views.xml",
        "views/sale_order_views.xml",
        "views/sale_order_line_views.xml"
    ],
    "installable": True,
    "auto_install": False,
    "application": True
}
