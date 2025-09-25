from odoo import models, fields
from odoo.exceptions import UserError
import io
from datetime import datetime, time, timedelta
import xlsxwriter

class GeneralReportXlsx(models.AbstractModel):
    _name = "helpdesk.report.general.xlsx"
    _description = "General report by date"

    def generate_report_general_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter no está disponible en el servidor")

        if not wizard.date_start or not wizard.date_end:
            raise UserError("Debe seleccionar la fecha de inicio y fin en el asistente.")

        start_date = datetime.combine(wizard.date_start, time.min)
        end_date = datetime.combine(wizard.date_end, time.max)

        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL
        """)
        results = self.env.cr.fetchall()
        stage_types = [str(r[0]) for r in results if r[0] is not None]
        stage_types.sort()

        if not stage_types:
            raise UserError("No se encontraron estados válidos en la base de datos.")

        
        company = self.env['res.company'].search([('name', '=', 'ADSSOFTWARE CIA LTDA')], limit=1)
        if not company:
            raise UserError("No se encontró la empresa ADSSOFTWARE CIA LTDA.")

        
        tickets = self.env['helpdesk.support'].search([
            ('request_date', '>=', start_date),
            ('request_date', '<=', end_date),
            ('company_id', '=', company.id),
            ('active', '=', True),
            ('stage_type', '!=', False),
        ])

        if not tickets:
            raise UserError("No se encontraron tickets en el rango especificado para ADSSOFTWARE CIA LTDA.")

       
        data = {}
        for ticket in tickets:
            if ticket.stage_type == "closed" and not ticket.is_close:
                continue  

            
            if not ticket.request_date:
                continue  

            fecha = ticket.request_date.date()
            estado = str(ticket.stage_type)

            if fecha not in data:
                data[fecha] = {}

            data[fecha][estado] = data[fecha].get(estado, 0) + 1


        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Reporte Tickets")

        header_format = workbook.add_format({
            'bold': True, 'bg_color': '#366092', 'font_color': 'white',
            'align': 'center', 'border': 1
        })
        cell_format = workbook.add_format({'align': 'center', 'border': 1})
        fecha_format = workbook.add_format({'align': 'center', 'border': 1, 'num_format': 'dd/mm/yyyy'})

        worksheet.write(0, 0, "FECHA", header_format)
        for col, estado in enumerate(stage_types, start=1):
            worksheet.write(0, col, estado.upper(), header_format)
        worksheet.write(0, len(stage_types) + 1, "TOTAL", header_format)

    
        row = 1
        totales_estados = {estado: 0 for estado in stage_types}
        total_general = 0

        current_date = start_date.date()
        end_date_only = end_date.date()

        while current_date <= end_date_only:
            worksheet.write_datetime(row, 0, datetime.combine(current_date, time.min), fecha_format)
            total_dia = 0
            for col, estado in enumerate(stage_types, start=1):
                valor = data.get(current_date, {}).get(estado, 0)
                worksheet.write_number(row, col, valor, cell_format)
                total_dia += valor
                totales_estados[estado] += valor
            worksheet.write_number(row, len(stage_types) + 1, total_dia, cell_format)
            total_general += total_dia
            row += 1
            current_date += timedelta(days=1)

        worksheet.write(row, 0, "TOTAL GENERAL", header_format)
        for col, estado in enumerate(stage_types, start=1):
            worksheet.write_number(row, col, totales_estados[estado], header_format)
        worksheet.write_number(row, len(stage_types) + 1, total_general, header_format)

        worksheet.set_column('A:A', 15)
        for i in range(1, len(stage_types) + 2):
            worksheet.set_column(i, i, 20)

        workbook.close()
        output.seek(0)
        return output.read()
