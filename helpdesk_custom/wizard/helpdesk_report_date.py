from odoo import api, fields, models
import base64  
# Necesitarías crear este modelo en Python
class HelpdeskReportDate(models.TransientModel):
    _name = 'helpdesk.report.date'
    _description = 'Helpdesk Report Date Wizard'
    
    date_start = fields.Date(string='Fecha Inicio')
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

    # En tu wizard helpdesk_report_date.py
    def action_generate_reporte_dia(self):
        report_helper = self.env['helpdesk.reporte.por.dia.xlsx']
        excel_data = report_helper.generate_reporte_por_dia_xlsx(self)
        
        # Crear attachment
        attachment = self.env['ir.attachment'].create({
            'name': f"Reporte_Por_Dia_{fields.Date.today()}.xlsx",
            'datas': base64.b64encode(excel_data),
            'res_model': self._name,
            'res_id': self.id,
            'type': 'binary'
        })
        
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }