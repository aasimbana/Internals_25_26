# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import ValidationError

class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    backup_chunk_mb = fields.Integer(
        string="Number of megabytes",
        default=100,
        help="Size of each backup fragment (in MB).",
        config_parameter="auto_database_backup.chunk_mb",
    )
@api.constrains("backup_chunk_mb")
def _check_backup_chunk_mb(self):
    for rec in self:
        if rec.backup_chunk_mb and rec.backup_chunk_mb > 150:
            raise ValidationError(
                _("⚠️ El tamaño del fragmento no debe sobrepasar los 150 MB.")
                )
        if rec.backup_chunk_mb and rec.backup_chunk_mb < 50:
            raise ValidationError(
                _("⚠️ El tamaño del fragmento debe ser al menos de 50 MB.")
                )
