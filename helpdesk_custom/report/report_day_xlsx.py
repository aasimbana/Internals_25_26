# report/reporte_por_dia_xlsx.py
import io
from datetime import datetime, time
from odoo import models
from odoo.exceptions import UserError
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

class ReportByDayXlsx(models.AbstractModel):
    _name = "helpdesk.reporte.por.dia.xlsx"
    _description = "Daily Report - Helpdesk"

    def generate_report_per_day_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter is not available on the server")

        self.env.cr.execute("""
            SELECT DISTINCT hs.stage_type 
            FROM helpdesk_support hs 
            WHERE hs.stage_type IN ('assigned', 'closed', 'new')
            AND hs.stage_type IS NOT NULL
            ORDER BY hs.stage_type ASC;
        """)
        results = self.env.cr.fetchall()
        states_interest = [row[0] for row in results if row[0] != 'new']

       
        employees = wizard.employee_ids
        if not employees:
            employees = self.env['hr.employee'].search([('technical_support', '=', True)])
        employees = employees.sorted(key=lambda r: r.name)
        user_ids = employees.mapped('user_id.id')

      
        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('close_date', '>=', datetime.combine(wizard.date_start, time.min)))
            domain.append(('close_date', '<=', datetime.combine(wizard.date_start, time.max)))
        domain.append(('user_id', 'in', user_ids))

        tickets = self.env['helpdesk.support'].search(domain)

    
        count = {status: {emp.name: 0 for emp in employees} for status in states_interest}
        total_closed = 0 

        for ticket in tickets:
            technical_name = ticket.user_id.employee_id.name if ticket.user_id.employee_id else 'Unassigned'
            current_status = ticket.stage_type if ticket.stage_type else "No status"

            if current_status != 'new': 
                if current_status not in count:
                    count[current_status] = {emp.name: 0 for emp in employees}
                if technical_name not in count[current_status]:
                    count[current_status][technical_name] = 0
                count[current_status][technical_name] += 1

                if current_status == 'closed':
                    total_closed += 1

       
        total_new = 0
        if wizard.date_start:
            self.env.cr.execute("""
                SELECT COUNT(*) 
                FROM helpdesk_support 
                WHERE stage_type = 'new' 
                AND DATE(create_date) = %s;
            """, (wizard.date_start,))
            total_new = self.env.cr.fetchone()[0] or 0

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Report by Day")

        header_format = workbook.add_format({
            'bold': True, 'bg_color': '#366092', 'font_color': 'white',
            'align': 'center', 'border': 1
        })
        tecnico_format = workbook.add_format({
            'bold': True, 'bg_color': '#E6E6E6', 'border': 1
        })
        numero_format = workbook.add_format({
            'align': 'center', 'border': 1
        })
        total_format = workbook.add_format({
            'bold': True, 'bg_color': '#FFCC00', 'align': 'center', 'border': 1
        })
        nuevos_format = workbook.add_format({
            'bold': True, 'bg_color': '#FF9999', 'align': 'center', 'border': 1
        })

        fecha_reporte = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "Date not specified"
        worksheet.merge_range('A1:D1', 'Report by Day - HELP DESK', header_format)
        worksheet.merge_range('A2:D2', f'Date: {fecha_reporte}', workbook.add_format({'align': 'center'}))

        worksheet.write(2, 0, "TECHNICIAN", header_format)
        col = 1
        for status in states_interest:
            worksheet.write(2, col, status.upper(), header_format)
            col += 1
        worksheet.write(2, col, "NEW", header_format)

        row = 3
        for emp in employees:
            worksheet.write(row, 0, emp.name, tecnico_format)
            c = 1
            for status in states_interest:
                worksheet.write_number(row, c, count[status].get(emp.name, 0), numero_format)
                c += 1
            worksheet.write(row, col, "-", numero_format)
            row += 1

        worksheet.merge_range(3, col, row-1, col, total_new, nuevos_format)

        row_total = row
        worksheet.merge_range(row_total, 0, row_total, col-1, "TOTAL CLOSED", total_format)
        worksheet.write_number(row_total, col, total_closed, total_format)

        worksheet.set_column('A:A', 25)
        worksheet.set_column('B:Z', 15)

        worksheet.write(row_total + 2, 0, f"Generated on: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

        workbook.close()
        output.seek(0)
        return output.read()
