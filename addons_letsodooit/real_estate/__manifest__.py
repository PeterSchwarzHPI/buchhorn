{
    "name": "Real Estate",
    "version": "18.0.1.0.1",
    "category": "Others",
    "summary": "This module allows to manage buildings, units and subunits.""",
    "website": "https://peter-schwarz.it/",
    "author": "Peter Schwarz (info@peter-schwarz.it)",
    "license": "AGPL-3",
    "depends": [
        "base",
        "mail"
    ],
    "data": [
        "data/decimal_precision_data.xml",
        "security/real_estate_security.xml",
        "security/ir.model.access.csv",
        "views/real_estate_building_views.xml",
        "views/real_estate_building_unit_views.xml",
        "views/real_estate_building_subunit_views.xml",
        "views/real_estate_building_type_views.xml",
        "views/real_estate_building_unit_type_views.xml",
        "views/real_estate_building_subunit_type_views.xml",
        "views/real_estate_building_heating_type_views.xml",
        "views/real_estate_building_level_of_retrofit_views.xml",
        "views/real_estate_menus.xml"
    ],
    "installable": True,
    "auto_install": False,
    "application": True
}
