// Biblioteca de documentos del sitio InvCiclicos ("FPK Costos e Inventarios") en SharePoint.
export const INV_CICLICOS_DRIVE_ID = "b!ecOAASPfHEOQPxqgdzBpa_ZjFZuocGJLmBjkKlAi_Kch2TQZGv2_SoBSLTLdF1kM";

// Año de los tableros: solo se sincronizan las carpetas 2026.
export const ANIO = 2026;

// "Inventario Cíclico - General 2026": desde octubre varias bodegas guardan aquí su conteo, en una
// subcarpeta con el código de la bodega (CT-02/, MP-08/, PT-10/…).
const GENERAL_2026 = "01AIPA37QJDLGXDLZTWJE2XWAULM6Y32CF";

export interface Carpeta {
  id: string;
  profundidad: number; // 0 = solo la carpeta; 1 o 2 = también subcarpetas (una por mes)
  incluir?: RegExp; // solo las rutas (relativas a la carpeta) que cumplan
}

interface BodegaBase {
  codigo: string; // código del tablero (URL); coincide con el WhsCode cuando es una sola bodega
  nombre: string;
  bodegasSap: string[]; // WhsCode de SAP contra los que se comparan los ajustes
  conceptosAjuste: string[]; // conceptos de SAP que cuentan como ajuste del conteo
  anio: number; // año cuando el nombre del archivo no lo trae
  excluir?: RegExp; // archivos que no son conteos (cronogramas, auditorías diarias…)
  // Tableros que agrupan disponible y exhibición: separa los conteos de cada una según la ruta.
  ubicacion?: (ruta: string) => string;
}

// Excel sueltos en una o varias carpetas. De cada archivo se toma la hoja de conteo (la preferida o la
// primera con estructura de conteo), o todas si todasLasHojas (Moldes: DIRECTO e INDIRECTO).
interface BodegaCarpeta extends BodegaBase {
  fuente: "carpeta";
  carpetas: Carpeta[];
  hojaPreferida?: RegExp;
  todasLasHojas?: boolean;
}

// Un solo Excel con una hoja por mes o por fecha de conteo ("INVENTARIO JUL 2026", "Agosto 31").
interface BodegaLibroAnual extends BodegaBase {
  fuente: "libro-anual";
  carpetaId: string;
  hojaMensual: RegExp;
}

export type Bodega = BodegaCarpeta | BodegaLibroAnual;

const AJUSTE = ["EAI", "SAI"];
const CRONOGRAMAS = /CRONOGRAMA/i;
// Hoja de conteo de la plantilla: "Inventario BD" y, desde agosto en las plantas, "Datos Inventario".
const HOJA_CONTEO = /^(Inventario BD|Datos Inventario)$/i;

// Subcarpeta de "General 2026" con el código de la bodega: desde octubre el equipo sube ahí los conteos.
const general = (codigo: string): Carpeta => ({ id: GENERAL_2026, profundidad: 1, incluir: new RegExp(`^${codigo}/`, "i") });

// Plantas: una subcarpeta por mes con un Excel por día de conteo.
const planta = (codigo: string, nombre: string, carpetaId: string): BodegaCarpeta => ({
  codigo,
  nombre,
  bodegasSap: [codigo],
  conceptosAjuste: AJUSTE,
  fuente: "carpeta",
  carpetas: [{ id: carpetaId, profundidad: 1 }, general(codigo)],
  anio: ANIO,
  excluir: CRONOGRAMAS,
  hojaPreferida: HOJA_CONTEO,
});

// Bodegas pequeñas: un Excel por mes en su carpeta y el de octubre en "General 2026".
const bodegaMensual = (codigo: string, nombre: string, carpetaId: string | null, extra: Partial<BodegaCarpeta> = {}): BodegaCarpeta => ({
  codigo,
  nombre,
  bodegasSap: [codigo],
  conceptosAjuste: AJUSTE,
  fuente: "carpeta",
  carpetas: [...(carpetaId ? [{ id: carpetaId, profundidad: 0 }] : []), general(codigo)],
  anio: ANIO,
  hojaPreferida: HOJA_CONTEO,
  ...extra,
});

export const BODEGAS: Bodega[] = [
  {
    codigo: "MP-01",
    nombre: "Almacén (MP-01 y MP-11)",
    bodegasSap: ["MP-01", "MP-11"],
    conceptosAjuste: AJUSTE,
    fuente: "carpeta",
    carpetas: [{ id: "01AIPA37RSDI6LKWTMLFH3DEZOOGY3OAZT", profundidad: 0 }], // MP-01 MP-11 Almacen/Almacen 2026
    anio: ANIO,
    hojaPreferida: HOJA_CONTEO,
  },
  bodegaMensual("MP-02", "Importaciones / mercancía en tránsito", null),
  planta("MP-03", "Planta Fibra de vidrio", "01AIPA37SFHT4RGCFC7FHKWZ6RR2PM3W65"),
  planta("MP-04", "Planta Muebles", "01AIPA37QK7YDCE5235BC3INMWPEJWDQBZ"),
  planta("MP-05", "Superficies", "01AIPA37R67Y2BV7ZHLZG365YX3AUNGUOM"),
  {
    codigo: "MP-06",
    nombre: "Moldes",
    bodegasSap: ["MP-06"],
    conceptosAjuste: AJUSTE,
    fuente: "carpeta",
    carpetas: [{ id: "01AIPA37TGZRGSKLTBFVB3ZXRCQ26Q2R7G", profundidad: 0 }, general("MP-06")], // Moldes 2026
    anio: ANIO,
    // "INV FIN DE MES" es el inventario de cierre (DIRECTO/INDIRECTO); el cíclico es "Inventario ciclico MP-06".
    excluir: /INV FIN DE MES|Acta de entrega|Actividades de inventario/i,
  },
  bodegaMensual("MP-07", "Servicios", "01AIPA37VA2NIQF27X3RH3PKPVBD6MLBOQ"), // MP-07 Servicios/Servicios 2026
  bodegaMensual("MP-08", "Devoluciones de MP", "01AIPA37VOVCUZF5CAZRHLMSKP7ERJBPIY"),
  {
    ...bodegaMensual("MP-09", "I+D+I", null),
    carpetas: [{ id: "01AIPA37UDKEUKNRD4H5D3BO6SQYVBX7K5", profundidad: 0 }, general("MP-09")], // MP-09 I+D+I/2026
  },
  planta("MP-10", "Planta Mármol sintético", "01AIPA37UFZBQV6RGFDRDZ3T55CPIUEZIX"),
  { ...planta("MP-12", "Muebles CEFI", "01AIPA37XPFQ7SRVFN4ZGK4YFJQC572BL6"), conceptosAjuste: [...AJUSTE, "ECA", "SCA"] },
  bodegaMensual("CT-02", "Recuperación de producto", "01AIPA37XY2RNQ4KGYK5CJN6BTPVHHNDXO"),
  {
    codigo: "CEDI",
    nombre: "Cedi (PT-01, PT-02, PT-08)",
    bodegasSap: ["PT-01", "PT-02", "PT-08"],
    conceptosAjuste: [...AJUSTE, "SCA"],
    fuente: "libro-anual",
    carpetaId: "01AIPA37VGHC3O7TJ4R5E2YWHEA4LAPKJW", // PT-01-02-08 Cedi/Cedi 2026
    anio: ANIO,
    hojaMensual: /^INVENTARIO [A-Z]{3,10} \d{4}$/i,
  },
  bodegaMensual("PT-03", "Devoluciones sitio", "01AIPA37WBTIWISAIR5RA3BFMLNTXOWBHI", {
    excluir: /AUDITORIA DIARIA/i,
    conceptosAjuste: [...AJUSTE, "EOA", "SOA"],
  }),
  bodegaMensual("PT-06", "Saldos", "01AIPA37TIYVVDBLAFNFG26VFVOFO2LAKP"),
  bodegaMensual("PT-09", "Fulfillment", "01AIPA37XKYKVGNMR3V5G2XEG3LQMW3PNM"),
  {
    codigo: "FHM",
    nombre: "FPK Home Medellín (PT-10, CN-01)",
    bodegasSap: ["PT-10", "CN-01"],
    conceptosAjuste: AJUSTE,
    fuente: "carpeta",
    carpetas: [{ id: "01AIPA37RMHNJROMZTKRAY37N4ZIDKRH4U", profundidad: 1 }, general("PT-10"), general("CN-01")],
    anio: ANIO,
    hojaPreferida: HOJA_CONTEO,
    ubicacion: (ruta) => (/EXHIBICION/i.test(ruta) || /^CN-01\//i.test(ruta) ? "Exhibición" : "Disponible"),
  },
  {
    codigo: "FHC",
    nombre: "FPK Home Cali (PT-11, CN-03)",
    bodegasSap: ["PT-11", "CN-03"],
    conceptosAjuste: AJUSTE,
    fuente: "carpeta",
    carpetas: [{ id: "01AIPA37QVIKBKUYJ4URB25YMQDTMO3FQU", profundidad: 1 }, general("PT-11"), general("CN-03")],
    anio: ANIO,
    hojaPreferida: HOJA_CONTEO,
    ubicacion: (ruta) => (/CN-03/i.test(ruta) ? "Exhibición" : "Disponible"),
  },
  {
    codigo: "FHB",
    nombre: "FPK Home Bogotá (PT-12, PT-13)",
    bodegasSap: ["PT-12", "PT-13"],
    conceptosAjuste: AJUSTE,
    fuente: "carpeta",
    // La carpeta de la bodega tiene una subcarpeta por mes de 2026 (y algunas con PT-12/PT-13 dentro).
    carpetas: [{ id: "01AIPA37TYGMXD5OIX25DKS5SXQZOWSXTK", profundidad: 2 }, general("PT-12"), general("PT-13")],
    anio: ANIO,
    hojaPreferida: HOJA_CONTEO,
    ubicacion: (ruta) => (/EXHIBICION|EXCI|PT-13/i.test(ruta) ? "Exhibición" : "Disponible"),
  },
];

export function getBodega(codigo: string) {
  return BODEGAS.find((b) => b.codigo.toLowerCase() === codigo.toLowerCase());
}

// Bodegas sin conteo cíclico: su Excel es una bitácora que se lee directo de SharePoint (no se sincroniza).
//  devoluciones: registro de devoluciones en tránsito; el estado de cada una se marca con colores.
//  cortes-stock: una hoja por fecha de corte con el stock de SAP ("Agosto 31", "Sept 16"…).
export interface BodegaSeguimiento {
  codigo: string;
  nombre: string;
  bodegasSap: string[];
  tipo: "devoluciones" | "cortes-stock";
  carpetaId: string;
  descripcion: string;
}

export const SEGUIMIENTOS: BodegaSeguimiento[] = [
  {
    codigo: "PT-04",
    nombre: "Devoluciones en tránsito",
    bodegasSap: ["PT-04"],
    tipo: "devoluciones",
    carpetaId: "01AIPA37TCPEEWEJBCA5E2EMOXUAUPWTY4", // PT-04 Dev transito/Dev Transito PT-04 (hoja "PT-04 2026")
    descripcion: "Bitácora de devoluciones",
  },
  {
    codigo: "PT-07",
    nombre: "Ferias",
    bodegasSap: ["PT-07"],
    tipo: "cortes-stock",
    carpetaId: "01AIPA37RFTRUXVTJRT5FYV47BUOWGLHWS", // PT-07 Ferias/Ferias PT-07 Ferias 2026
    descripcion: "Cortes de stock",
  },
];

export function getSeguimiento(codigo: string) {
  return SEGUIMIENTOS.find((b) => b.codigo.toLowerCase() === codigo.toLowerCase());
}
