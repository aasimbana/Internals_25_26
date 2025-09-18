from odoo import models, fields

class HrEmployeeCustom(models.Model):
    _inherit = "hr.employee"

    soporte_tecnico = fields.Boolean(string="Soporte Técnico")
    # report_manager = fields.Boolean(string="Report Manager")