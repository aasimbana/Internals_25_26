{
    "name": "Helpdesk Workflow Custom",
    "version": "17.0.1.0.0",
    "summary": "Requeridos y sin quick-create en Helpdesk",
    "author": "TuEmpresa",
    "depends": ["website_helpdesk_support_ticket"],  # <--- aquí está el cambio
    "data": ["views/helpdesk_support_views.xml"],
    "license": "LGPL-3",
    "installable": True,
}
