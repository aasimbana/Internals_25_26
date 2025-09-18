from datetime import datetime, time
from odoo import models, fields

class HelpdeskReportPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.report_helpdesk_pdf"
    _description = "Reporte Helpdesk PDF"

    def _get_report_values(self, docids, data=None):
        wizard = self.env['helpdesk.report.wizard'].browse(docids)

        # Estados fijos
        estados = [
            "TEC_Espera",
            "TEC_Asignación_Técnico",
            "TEC_Ticket_Progreso",
            "TEC_Supervisores",
            "TEC_Soporte a PRG",
            "PRG_Asignado_(Proceso_PRG)",
            "COTIZACION_PRG",
            "PRG_Validación_TEC",
            "MEJORAS EN PROCESOS",
            "TEC_Cerrado",
        ]

        # Empleados
        empleados = wizard.employee_ids
        if not empleados:
            empleados = self.env['hr.employee'].search([('soporte_tecnico', '=', True)])
        empleados = empleados.sorted(key=lambda r: r.name)

        # Domain de tickets
        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('create_date', '<=', datetime.combine(wizard.date_end, time.max)))

        user_ids = empleados.mapped('user_id.id')
        domain.append(('user_id', 'in', user_ids))
        tickets = self.env['helpdesk.support'].search(domain)

        # Conteo
        conteo = {estado: {emp.name: 0 for emp in empleados} for estado in estados}
        total_por_tecnico = {emp.name: 0 for emp in empleados}
        total_general = 0

        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id.employee_id else 'Sin asignar'
            estado_code = ticket.stage_id.name if ticket.stage_id else 'Sin Estado'
            if estado_code not in estados:
                estado_code = 'Sin Estado'
                if estado_code not in conteo:
                    conteo[estado_code] = {emp.name: 0 for emp in empleados}

            if tecnico_name not in total_por_tecnico:
                total_por_tecnico[tecnico_name] = 0

            conteo[estado_code][tecnico_name] += 1
            total_por_tecnico[tecnico_name] += 1
            total_general += 1

        empleados_dict = [{'name': e.name, 'id': e.id or 0, '_name': 'hr.employee'} for e in empleados]

        fecha_inicio = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A"
        fecha_fin = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "N/A"
        fecha_generacion = datetime.now().strftime("%d/%m/%Y %H:%M")


        return {
            'doc_ids': docids,
            'doc_model': 'helpdesk.report.wizard',
            'data': {
                'estados': estados,
                'empleados': empleados_dict,
                'conteo': conteo,
                'total_por_tecnico': total_por_tecnico,
                'total_general': total_general,
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'fecha_generacion': fecha_generacion,
            },
            'docs': wizard,
        }
