import * as XLSX from "xlsx";
import { graphFetch, graphFetchBuffer } from "./client";

export type Cell = string | number | boolean | null;

export interface DriveFile {
  id: string;
  name: string;
  path: string; // ruta relativa a la carpeta inicial, p. ej. "Abril/INVEN. PLANTA FV 09-04.xlsx"
  lastModifiedDateTime: string;
}

type DriveItem = { id: string; name: string; lastModifiedDateTime: string; file?: object; folder?: object };

// Archivos .xlsx de una carpeta y, hasta `profundidad` niveles, de sus subcarpetas (p. ej. una por mes).
export async function listExcelFiles(driveId: string, folderId: string, profundidad = 0, prefijo = ""): Promise<DriveFile[]> {
  const data = await graphFetch<{ value: DriveItem[] }>(
    `/drives/${driveId}/items/${folderId}/children?$top=500&$select=id,name,lastModifiedDateTime,file,folder`,
  );
  const archivos: DriveFile[] = [];
  for (const item of data.value) {
    const path = prefijo ? `${prefijo}/${item.name}` : item.name;
    if (item.file && /\.xlsx$/i.test(item.name) && !item.name.startsWith("~$")) {
      archivos.push({ id: item.id, name: item.name, path, lastModifiedDateTime: item.lastModifiedDateTime });
    } else if (item.folder && profundidad > 0) {
      archivos.push(...(await listExcelFiles(driveId, item.id, profundidad - 1, path)));
    }
  }
  return archivos;
}

// Se descarga el archivo y se lee con SheetJS: funciona para cualquier tamaño (la API de Excel de
// Graph agota el tiempo con libros de decenas de MB). Las hojas se convierten a filas solo al pedirlas.
// Con `estilos` también se leen los rellenos de las celdas (bitácoras que marcan el estado con colores).
export async function downloadWorkbook(driveId: string, itemId: string, { estilos = false } = {}) {
  const buffer = await graphFetchBuffer(`/drives/${driveId}/items/${itemId}/content`);
  const libro = XLSX.read(buffer, { type: "buffer", dense: true, cellStyles: estilos });
  const ocultas = new Set((libro.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name));
  return {
    hojas: libro.SheetNames,
    // Las hojas ocultas son copias viejas de la plantilla (p. ej. "Inventario ciclo 1" con conteos de 2020).
    ocultas,
    // Con estilos, SheetJS convierte en fecha (a veces inválida) el texto de las celdas con formato de
    // fecha, p. ej. "11/02/2026"; por eso se toman los valores crudos: fechas válidas como número de serie
    // y las inválidas con su texto.
    leer: (nombre: string): Cell[][] =>
      estilos
        ? (libro.Sheets[nombre]?.["!data"] ?? []).map((fila) =>
            (fila ?? []).map((c) => {
              const v = c?.v;
              if (v instanceof Date)
                return Number.isNaN(v.getTime())
                  ? (c?.w ?? null)
                  : (Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;
              return v ?? null;
            }),
          )
        : XLSX.utils.sheet_to_json<Cell[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null }),
    // Color de relleno (RGB, p. ej. "92D050") de una celda; fila y columna desde 0.
    relleno: (nombre: string, fila: number, columna: number): string | null => {
      const celda = libro.Sheets[nombre]?.["!data"]?.[fila]?.[columna] as { s?: { fgColor?: { rgb?: string } } } | undefined;
      return celda?.s?.fgColor?.rgb?.toUpperCase() ?? null;
    },
  };
}
