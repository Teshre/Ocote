// vt_parser.rs — Decodificador de secuencias ANSI/VT100
//
// Cuando bash produce output con color, no manda texto plano.
// Manda algo como: "\033[1;32mhello\033[0m"
// Eso significa: "pon bold+verde, escribe 'hello', luego reset".
//
// La crate `vte` parsea estas secuencias y llama callbacks en nuestro
// handler. Nosotros convertimos cada evento en HTML que el frontend puede renderizar.
//
// FASE 1 — Semanas 5-7

// use vte::{Parser, Perform};

// Nuestro handler que recibe los eventos del parser VT
// pub struct OcoteVtHandler {
//     // El HTML acumulado que mandaremos al frontend
//     pub output: String,
//     // Estado del color/estilo actual
//     // current_fg, current_bg, bold, italic...
// }

// impl Perform for OcoteVtHandler {
//     // Llamado para cada carácter de texto normal
//     fn print(&mut self, c: char) {
//         todo!("Fase 1 Semana 5: añadir char al output HTML")
//     }
//
//     // Llamado para secuencias de escape (colores, cursor, etc.)
//     fn csi_dispatch(&mut self, params: &vte::Params, ...) {
//         todo!("Fase 1 Semana 6: interpretar parámetros de color")
//     }
// }
