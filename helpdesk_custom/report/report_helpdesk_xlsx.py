# helpdesk_custom/report/report_helpdesk_xlsx.py
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
    _description = "Helper para generar XLSX del reporte helpdesk"

    def generate_helpdesk_report_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter no está disponible en el server")

        # Lista de estados que nos interesan (nombres exactos como están en la BD)
        target_stages = [
            'TEC_Espera',
            'TEC_Asignación_Técnico',
            'TEC_Ticket_Progress',
            'TEC_Supervisores',
            'TEC_Soporte a PRG',
            'PRG_Asignado_(Processo_PRG)',
            'COTIZACION_PRG',
            'PRG_Validación_TEC',
            'MEJORAS EN PROCESOS',
            'TEC_Cerrado'
        ]

        # 1. Recuperar TODOS los registros de helpdesk.stage.config
        all_stages = self.env['helpdesk.stage.config'].search([])

        # 2. Lista auxiliar para filtrar los estados válidos - USANDO EL CAMPO NAME
        estados_validos = []
        estados_records_validos = []

        for stage in all_stages:
            try:
                # Verificar si NAME existe y es un string (no stage_type)
                if stage.name:
                    # Si es string, intentar convertirlo a dict
                    if isinstance(stage.name, str):
                        # Manejar casos especiales primero
                        if stage.name.strip() in ['', 'new', '{}', 'null']:
                            continue
                        
                        # Intentar convertir el string a dict (JSON)
                        try:
                            stage_dict = json.loads(stage.name)
                        except (json.JSONDecodeError, TypeError):
                            # Si no es JSON válido, saltar este registro
                                continue
                    else:
                        # Si ya es un dict (puede pasar en algunos casos)
                        stage_dict = stage.name
                    
                    # Extraer valores en español e inglés DEL CAMPO NAME
                    valor_es = stage_dict.get('es_EC') or stage_dict.get('es')
                    valor_en = stage_dict.get('en_US') or stage_dict.get('en')
                    
                    # Verificar si alguno de los valores está en nuestra lista target
                    if valor_es in target_stages or valor_en in target_stages:
                        estado_valor = valor_es or valor_en
                        estados_validos.append(estado_valor)
                        estados_records_validos.append(stage)
                        
            except Exception as e:
                # Si hay algún error con este registro, continuar con el siguiente
                continue

        # 3. Eliminar duplicados y ordenar
        estados_unique = list(dict.fromkeys(estados_validos))  # Mantener orden
        estados_records = estados_records_validos

        # 4. Si no encontramos estados, usar los target_stages directamente
        # if not estados_records:
        #     estados_unique = target_stages

        # 5. USAR LOS NOMBRES ORIGINALES SIN MAPEO
        estados = estados_unique
        
        # Agregar "Sin Estado" si no está en la lista
        # if 'Sin Estado' not in estados:
        #     estados.append('Sin Estado')

        empleados = wizard.employee_ids
        if not empleados:
            empleados = self.env['hr.employee'].search([('soporte_tecnico','=',True)])

        empleados = empleados.sorted(key=lambda r: r.name)

        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('create_date', '<=', datetime.combine(wizard.date_end, time.max)))

        user_ids = empleados.mapped('user_id.id')
        domain.append(('user_id', 'in', user_ids))
        tickets = self.env['helpdesk.support'].search(domain)

        # INICIALIZAR CONTEO COMO EN EL PDF - CORREGIDO
        conteo = {}
        total_por_tecnico = {}
        total_general = 0

        # Inicializar conteo para todos los estados con todos los empleados
        for estado in estados:
            conteo[estado] = {}
            for emp in empleados:
                conteo[estado][emp.name] = 0

        # Inicializar totales por técnico para los empleados seleccionados
        for emp in empleados:
            total_por_tecnico[emp.name] = 0

        # CONTAR TICKETS CON LA LÓGICA DEL PDF - CORREGIDO
        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id and ticket.user_id.employee_id else 'Sin asignar'
            estado_code = ticket.stage_id.name if ticket.stage_id else 'Sin Estado'
            
            # Si el estado no está en la lista, usar "Sin Estado"
            if estado_code not in estados:
                estado_code = 'Sin Estado'
                # Si "Sin Estado" no existe en el conteo, crearlo dinámicamente
                if estado_code not in conteo:
                    conteo[estado_code] = {}
                    for emp in empleados:
                        conteo[estado_code][emp.name] = 0

            # Si el técnico no está en la lista de empleados seleccionados, usar 'Sin asignar'
            if tecnico_name not in total_por_tecnico:
                tecnico_name = 'Sin asignar'
                # Si 'Sin asignar' no existe en el conteo, crearlo dinámicamente
                if tecnico_name not in total_por_tecnico:
                    total_por_tecnico[tecnico_name] = 0
                    for estado in conteo:
                        conteo[estado][tecnico_name] = 0

            # Realizar el conteo
            conteo[estado_code][tecnico_name] += 1
            total_por_tecnico[tecnico_name] += 1
            total_general += 1

        # Crear XLSX
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Reporte Helpdesk")

        header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'align': 'center'})
        estado_format = workbook.add_format({'bg_color': '#FCE4D6', 'align': 'center'})
        center = workbook.add_format({'align': 'center'})
        total_format = workbook.add_format({'bold': True, 'bg_color': '#BDD7EE', 'align': 'center'})
        total_general_format = workbook.add_format({'bold': True, 'bg_color': '#FFC000', 'align': 'center'})

        # Obtener todos los técnicos (empleados seleccionados + 'Sin asignar')
        todos_tecnicos = list(empleados.mapped('name')) + ['Sin asignar']
        todos_tecnicos = list(dict.fromkeys(todos_tecnicos))  # Eliminar duplicados
        todos_tecnicos.sort()

        worksheet.write(0, 0, "ESTADO / TÉCNICO", header_format)
        for col, tecnico in enumerate(todos_tecnicos, start=1):
            worksheet.write(0, col, tecnico, header_format)
        worksheet.write(0, len(todos_tecnicos)+1, "TOTAL ESTADO", header_format)

        for row, estado in enumerate(estados, start=1):
            worksheet.write(row, 0, estado, estado_format)
            total_estado = 0
            for col, tecnico in enumerate(todos_tecnicos, start=1):
                valor = conteo[estado].get(tecnico, 0)
                worksheet.write_number(row, col, valor, center)
                total_estado += valor
            worksheet.write_number(row, len(todos_tecnicos)+1, total_estado, total_format)

        row_total = len(estados) + 1
        worksheet.write(row_total, 0, "TOTAL POR TÉCNICO", total_format)
        for col, tecnico in enumerate(todos_tecnicos, start=1):
            worksheet.write_number(row_total, col, total_por_tecnico.get(tecnico, 0), total_format)

        total_general_row = row_total + 1
        worksheet.merge_range(
            total_general_row, 0,
            total_general_row, len(todos_tecnicos)+1,
            f"TOTAL GENERAL: {total_general}",
            total_general_format
        )

        fecha_row = total_general_row + 1
        fecha_inicio = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A"
        fecha_fin = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "N/A"
        texto_fechas = f"Reporte generado del {fecha_inicio} al {fecha_fin}"
        worksheet.merge_range(
            fecha_row, 0,
            fecha_row, len(todos_tecnicos)+1,
            texto_fechas,
            center
        )

        workbook.close()
        output.seek(0)
        
        return output.read()