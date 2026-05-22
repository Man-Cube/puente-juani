const axios = require('axios');
const Papa = require('papaparse');

// Variables
let catalogoFresquito = []; 
const URL_TU_EXCEL_CSV = "ACA_PONE_EL_LINK_CSV_DE_TU_EXCEL";
const TOKEN_SCANNTECH = "ACA_PONE_TU_TOKEN_DE_SCANNTECH";

// 1. EL MOTOR QUE BUSCA PRECIOS Y STOCK EN SCANNTECH
async function armarCatalogoMaestro() {
    try {
        console.log("Iniciando sincronización...");
        const respuestaExcel = await axios.get(URL_TU_EXCEL_CSV);
        const datosExcel = Papa.parse(respuestaExcel.data, { header: true, skipEmptyLines: true }).data;
        let catalogoTemporal = [];

        for (let producto of datosExcel) {
            if (!producto.codigo) continue;

            try {
                // Le pegamos a Scanntech con el código de barras
                const resScanntech = await axios.get(`URL_API_SCANNTECH_AQUI/articulos/${producto.codigo}`, {
                    headers: { 'Authorization': TOKEN_SCANNTECH }
                });
                
                const dataScan = resScanntech.data;

                // Armamos el producto usando la foto del Excel + el precio/stock de Scanntech
                catalogoTemporal.push({
                    codigo: producto.codigo,
                    nombre: producto.nombre,
                    categoria: producto.categoria,
                    subcategoria: producto.subcategoria || "General",
                    imagen: producto.imagen,
                    // Usamos la ruta exacta del payload que me mostraste hoy:
                    precio: parseFloat(dataScan.venta.valor), 
                    stockDisponible: parseInt(dataScan.totalStock.valor) || 0 
                });
            } catch (errorItem) {
                console.log(`Error con el código ${producto.codigo}`);
            }
        }

        catalogoFresquito = catalogoTemporal;
        console.log("¡Catálogo actualizado!");
    } catch (error) {
        console.error("Error fatal en la sincronización", error);
    }
}

// Arranca el relojito automático (cada 30 min = 1800000 milisegundos)
armarCatalogoMaestro();
setInterval(armarCatalogoMaestro, 1800000);

// 2. LA RUTA PARA QUE LA APP DE LAS DOÑAS LEA EL CATÁLOGO
app.get('/api/catalogo-juani', (req, res) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    res.json(catalogoFresquito);
});

// 3. EL BOTÓN DE PÁNICO (Sincronización Manual para AppSheet)
app.post('/api/sincronizar-manual', async (req, res) => {
    const clave = req.headers['authorization'];
    if (clave !== 'CHACHO_ADMIN_123') {
        return res.status(403).send("Sin permiso");
    }
    await armarCatalogoMaestro();
    res.send("Sincronización forzada completada");
});
