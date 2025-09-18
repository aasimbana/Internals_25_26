{
    "name": "Helpdesk Workflow Custom",
    "version": "17.0.1.0.0",
    "summary": "Requeridos y sin quick-create en Helpdesk",
    "depends": ["website_helpdesk_support_ticket","hr"],
    "data": [
        "wizard/menu_report_helpdesk.xml",
        "wizard/report_helpdesk.xml",
        "wizard/report_date.xml", 
        "security/report_permits.xml",
        "security/ir.model.access.csv",     
        "views/helpdesk_support_views.xml",
        "views/hr_employee_custom_views.xml",
        #"wizard/view_helpdesk_report_wizard_form.xml",  # <- aquí va la carpeta correcta
        "report/helpdesk_report.xml",              # << aquí defines el action del reporte
        "report/helpdesk_report_template.xml",
    ],
    "license": "LGPL-3",
    "installable": True,
}
