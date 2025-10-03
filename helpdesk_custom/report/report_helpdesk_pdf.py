from datetime import datetime, time
from odoo import models, fields
import json

class HelpdeskReportPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.report_helpdesk_pdf"
    _description = "Reporte Helpdesk PDF"

    def _get_report_values(self, docids, data=None):
        wizard = self.env['helpdesk.report.wizard'].browse(docids)

        try:
            # 🔹 Traemos los nombres de ticket_type
            query = "SELECT DISTINCT name FROM ticket_type WHERE name IS NOT NULL"
            self.env.cr.execute(query)
            results = self.env.cr.fetchall()

            unique_states = []
            for row in results:
                name_value = row[0]

                if isinstance(name_value, str):
                    try:
                        stage_dict = json.loads(name_value)
                    except json.JSONDecodeError:
                        stage_dict = {"es_EC": name_value, "en_US": name_value}
                elif isinstance(name_value, dict):
                    stage_dict = name_value
                else:
                    stage_dict = {"es_EC": str(name_value), "en_US": str(name_value)}

                value_es = stage_dict.get('es_EC')
                value_en = stage_dict.get('en_US')
                state_value = value_es or value_en
                if state_value:
                    unique_states.append(state_value)

            # Eliminamos duplicados
            states = list(dict.fromkeys(unique_states))

        except Exception as e:
            raise ValueError(
                "No se pudieron obtener los ticket_type desde la base de datos"
            ) from e

        # 🔹 Técnicos (empleados)
        employees = wizard.employee_ids
        if not employees:
            employees = self.env['hr.employee'].search([('technical_support', '=', True)])
        employees = employees.sorted(key=lambda r: r.name)

        # 🔹 Filtrado de tickets
        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('close_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('close_date', '<=', datetime.combine(wizard.date_end, time.max)))

        user_ids = employees.mapped('user_id.id')
        domain.append(('user_id', 'in', user_ids))
        tickets = self.env['helpdesk.support'].search(domain)

        # 🔹 Inicializamos contadores
        count = {estado: {emp.name: 0 for emp in employees} for estado in states}
        total_per_technician = {emp.name: 0 for emp in employees}
        total_general = 0

        # 🔹 Aseguramos que "Ninguno" siempre exista
        if "Ninguno" not in count:
            count["Ninguno"] = {emp.name: 0 for emp in employees}

        # Contamos tickets
        for ticket in tickets:
            tech_name = ticket.user_id.employee_id.name if ticket.user_id and ticket.user_id.employee_id else 'Unassigned'
            state_code = ticket.type_ticket_id.name if ticket.type_ticket_id else 'Ninguno'

            if state_code not in states and state_code != "Ninguno":
                state_code = 'Ninguno'

            if state_code not in count:
                count[state_code] = {emp.name: 0 for emp in employees}
            if tech_name not in total_per_technician:
                total_per_technician[tech_name] = 0
                for estado in count:
                    count[estado][tech_name] = 0

            count[state_code][tech_name] += 1
            total_per_technician[tech_name] += 1
            total_general += 1

        # Movemos "Ninguno" al final de la lista de estados
        if "Ninguno" in states:
            states = [s for s in states if s != "Ninguno"] + ["Ninguno"]
        else:
            states = states + ["Ninguno"]

        employees_dict = [{'name': e.name, 'id': e.id or 0, '_name': 'hr.employee'} for e in employees]
        start_date = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A"
        end_date = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "N/A"
        generation_date = datetime.now().strftime("%d/%m/%Y %H:%M")

        return {
            'doc_ids': docids,
            'doc_model': 'helpdesk.report.wizard',
            'data': {
                'states': states,
                'employees': employees_dict,
                'count': count,
                'total_per_technician': total_per_technician,
                'total_general': total_general,
                'start_date': start_date,
                'end_date': end_date,
                'generation_date': generation_date,
            },
            'docs': wizard,
        }
