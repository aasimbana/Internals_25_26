from odoo import api, fields, models
import base64
from datetime import datetime, time 

class HelpdeskReportWizard(models.TransientModel):
    _name = "helpdesk.report.wizard"
    _description = "Wizard de Reporte Helpdesk"

    date_start = fields.Date(string="Fecha Inicio")
    date_end = fields.Date(string="Fecha Fin")
    company_id = fields.Many2one(
        "res.company",
        string="Empresa",
        default=lambda self: self.env.company.id
    )
    employee_ids = fields.Many2many(
        "hr.employee",
        string="Empleados de Soporte",
        domain=[("soporte_tecnico", "=", True)]
    )

    def action_generate_excel(self):
        """Genera el XLSX y devuelve una acción para descargarlo."""
        self.ensure_one()
        helper = self.env['helpdesk.report.xlsx.helper']
        xlsx_data = helper.generate_helpdesk_report_xlsx(self)

        filename = 'Reporte_Helpdesk_%s.xlsx' % (fields.Date.today().strftime("%Y%m%d"))
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(xlsx_data),
            'res_model': self._name,
            'res_id': self.id,
            'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }
    
    def action_generate_pdf(self):
        return self.env.ref("helpdesk_custom.action_report_helpdesk_pdf").report_action(self)

    @api.model
    def open_helpdesk_report_wizard(self):
        settings = self.env['res.config.settings'].sudo().get_values()
        allowed_user = settings.get('only_user_id')
        if allowed_user and self.env.user.id != allowed_user:
            return False  # o lanzar UserError
        return {
        'name': 'Reportes de Helpdesk',
        'type': 'ir.actions.act_window',
        'res_model': 'helpdesk.report.wizard',
        'view_mode': 'form',
        'view_id': self.env.ref('helpdesk_custom.view_helpdesk_report_wizard_form').id,
        'target': 'new',
    }

