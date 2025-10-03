import io
import json
from datetime import datetime, time
from odoo import models, fields, api
from odoo.exceptions import UserError

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None


class HelpdeskReportXlsx(models.AbstractModel):
    _name = "helpdesk.report.xlsx.helper"
    _description = "Helper to generate XLSX for Helpdesk Report"

    def generate_helpdesk_report_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter is not available on the server")

        # SQL query to get state names
        try:
            query = """
                SELECT DISTINCT name AS estado
                FROM public.ticket_type;
            """
            self.env.cr.execute(query)
            results = self.env.cr.fetchall()

            unique_states = []

            for row in results:
                name_value = row[0]
                stage_dict = None

                # Case 1: string, try to parse as JSON
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

            unique_states = list(dict.fromkeys(unique_states))

        except Exception as e:
            raise ValueError(
                "Failed to retrieve states from the database, a default list will be used"
            ) from e

        # Use retrieved states
        states = unique_states

        employees = wizard.employee_ids
        if not employees:
            employees = self.env['hr.employee'].search([('technical_support', '=', True)])

        employees = employees.sorted(key=lambda r: r.name)

        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('close_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('close_date', '<=', datetime.combine(wizard.date_end, time.max)))

        user_ids = employees.mapped('user_id.id')
        domain.append(('user_id', 'in', user_ids))
        tickets = self.env['helpdesk.support'].search(domain)

        # Initialize counters
        ticket_count = {}
        total_by_technician = {}
        total_overall = 0

        # Initialize count for all states and employees
        for state in states:
            ticket_count[state] = {}
            for emp in employees:
                ticket_count[state][emp.name] = 0

        # 🔹 Aseguramos que "Ninguno" siempre exista
        if "Ninguno" not in ticket_count:
            ticket_count["Ninguno"] = {}
            for emp in employees:
                ticket_count["Ninguno"][emp.name] = 0

        # Initialize total per technician
        for emp in employees:
            total_by_technician[emp.name] = 0

        # Count tickets
        for ticket in tickets:
            technician_name = (
                ticket.user_id.employee_id.name
                if ticket.user_id and ticket.user_id.employee_id
                else 'Unassigned'
            )

            # usar type_ticket_id.name en lugar de stage_id
            state_code = ticket.type_ticket_id.name if ticket.type_ticket_id else 'Ninguno'

            if state_code not in states and state_code != "Ninguno":
                state_code = 'Ninguno'

            if state_code not in ticket_count:
                ticket_count[state_code] = {}
                for emp in employees:
                    ticket_count[state_code][emp.name] = 0

            if technician_name not in total_by_technician:
                technician_name = 'Unassigned'
                if technician_name not in total_by_technician:
                    total_by_technician[technician_name] = 0
                    for state in ticket_count:
                        ticket_count[state][technician_name] = 0

            ticket_count[state_code][technician_name] += 1
            total_by_technician[technician_name] += 1
            total_overall += 1

        # Create XLSX
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Helpdesk Report")

        header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'align': 'center'})
        state_format = workbook.add_format({'bg_color': '#FCE4D6', 'align': 'center'})
        center_format = workbook.add_format({'align': 'center'})
        total_format = workbook.add_format({'bold': True, 'bg_color': '#BDD7EE', 'align': 'center'})
        total_overall_format = workbook.add_format({'bold': True, 'bg_color': '#FFC000', 'align': 'center'})

        all_technicians = list(employees.mapped('name'))
        all_technicians = list(dict.fromkeys(all_technicians))
        all_technicians.sort()

        worksheet.write(0, 0, "STATE / TECHNICIAN", header_format)
        for col, technician in enumerate(all_technicians, start=1):
            worksheet.write(0, col, technician, header_format)
        worksheet.write(0, len(all_technicians) + 1, "TOTAL PER STATE", header_format)

        # 🔹 Mover "Ninguno" al final de la lista de estados
        if "Ninguno" in states:
            states = [s for s in states if s != "Ninguno"] + ["Ninguno"]
        else:
            states = states + ["Ninguno"]

        for row, state in enumerate(states, start=1):
            worksheet.write(row, 0, state, state_format)
            total_state = 0
            for col, technician in enumerate(all_technicians, start=1):
                value = ticket_count[state].get(technician, 0)
                worksheet.write_number(row, col, value, center_format)
                total_state += value
            worksheet.write_number(row, len(all_technicians) + 1, total_state, total_format)

        row_total = len(states) + 1
        worksheet.write(row_total, 0, "TOTAL PER TECHNICIAN", total_format)
        for col, technician in enumerate(all_technicians, start=1):
            worksheet.write_number(row_total, col, total_by_technician.get(technician, 0), total_format)

        total_overall_row = row_total + 1
        worksheet.merge_range(
            total_overall_row, 0,
            total_overall_row, len(all_technicians) + 1,
            f"TOTAL OVERALL: {total_overall}",
            total_overall_format
        )

        date_row = total_overall_row + 1
        start_date = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A"
        end_date = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "N/A"
        date_text = f"Report generated from {start_date} to {end_date}"
        worksheet.merge_range(
            date_row, 0,
            date_row, len(all_technicians) + 1,
            date_text,
            center_format
        )

        workbook.close()
        output.seek(0)

        return output.read()
