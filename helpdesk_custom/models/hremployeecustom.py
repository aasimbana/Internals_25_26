from odoo import models, fields

class HrEmployeeCustom(models.Model):
    _inherit = "hr.employee"

    technical_support = fields.Boolean(string="Technical Support")
    # report_manager = fields.Boolean(string="Report Manager")