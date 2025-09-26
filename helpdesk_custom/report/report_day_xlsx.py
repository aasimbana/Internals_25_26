# report/reporte_por_dia_xlsx.py
import io
from datetime import datetime, time
from odoo import models
from odoo.exceptions import UserError
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

class ReportePorDiaXlsx(models.AbstractModel):
    _name = "helpdesk.reporte.por.dia.xlsx"
    _description = "Reporte por Día - KPI Helpdesk"

    def generate_report_per_day_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter no está disponible en el server")

        # 🔹 Recuperar estados dinámicamente por SQL (excepto 'new')
        self.env.cr.execute("""
            SELECT DISTINCT hs.stage_type 
            FROM helpdesk_support hs 
            WHERE hs.stage_type IN ('assigned', 'closed', 'new')
            AND hs.stage_type IS NOT NULL
            ORDER BY hs.stage_type ASC;
        """)
        resultados = self.env.cr.fetchall()
        estados_interes = [row[0] for row in resultados if row[0] != 'new']

        # Empleados de soporte técnico
        empleados = wizard.employee_ids
        if not empleados:
            empleados = self.env['hr.employee'].search([('technical_support', '=', True)])
        empleados = empleados.sorted(key=lambda r: r.name)
        user_ids = empleados.mapped('user_id.id')

        # Construir domain para UN SOLO DÍA (assigned y closed)
        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
            domain.append(('create_date', '<=', datetime.combine(wizard.date_start, time.max)))
        domain.append(('user_id', 'in', user_ids))

        tickets = self.env['helpdesk.support'].search(domain)

        # Inicializar conteos
        conteo = {estado: {emp.name: 0 for emp in empleados} for estado in estados_interes}
        total_cerrados = 0  # Solo tickets closed

        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id.employee_id else 'Sin asignar'
            estado_actual = ticket.stage_type if ticket.stage_type else "Sin Estado"

            if estado_actual != 'new':  # assigned y closed para conteo por técnico
                if estado_actual not in conteo:
                    conteo[estado_actual] = {emp.name: 0 for emp in empleados}
                if tecnico_name not in conteo[estado_actual]:
                    conteo[estado_actual][tecnico_name] = 0
                conteo[estado_actual][tecnico_name] += 1

                # Solo sumamos los cerrados al total general
                if estado_actual == 'closed':
                    total_cerrados += 1

        # 🔹 Obtener tickets nuevos del día mediante SQL
        total_nuevos = 0
        if wizard.date_start:
            self.env.cr.execute("""
                SELECT COUNT(*) 
                FROM helpdesk_support 
                WHERE stage_type = 'new' 
                AND DATE(create_date) = %s;
            """, (wizard.date_start,))
            total_nuevos = self.env.cr.fetchone()[0] or 0

        # Crear Excel
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Reporte por Día")

        # Formatos
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

        # Título
        fecha_reporte = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "Fecha no especificada"
        worksheet.merge_range('A1:D1', 'REPORTE POR DÍA - HELP DESK', header_format)
        worksheet.merge_range('A2:D2', f'Fecha: {fecha_reporte}', workbook.add_format({'align': 'center'}))

        # Cabecera dinámica
        worksheet.write(2, 0, "TÉCNICO", header_format)
        col = 1
        for estado in estados_interes:
            worksheet.write(2, col, estado.upper(), header_format)
            col += 1
        worksheet.write(2, col, "NEW", header_format)

        # Datos por técnico (columna NEW vacía)
        row = 3
        for emp in empleados:
            worksheet.write(row, 0, emp.name, tecnico_format)
            c = 1
            for estado in estados_interes:
                worksheet.write_number(row, c, conteo[estado].get(emp.name, 0), numero_format)
                c += 1
            worksheet.write(row, col, "-", numero_format)
            row += 1

        # Fila combinada para NEW
        worksheet.merge_range(3, col, row-1, col, total_nuevos, nuevos_format)

        # TOTAL GENERAL (solo cerrados)
        row_total = row
        worksheet.merge_range(row_total, 0, row_total, col-1, "TOTAL CERRADOS", total_format)
        worksheet.write_number(row_total, col, total_cerrados, total_format)

        # Ajustar anchos
        worksheet.set_column('A:A', 25)
        worksheet.set_column('B:Z', 15)

        # Fecha de generación
        worksheet.write(row_total + 2, 0, f"Generado el: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

        workbook.close()
        output.seek(0)
        return output.read()
