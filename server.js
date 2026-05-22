const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Papa = require('papaparse');

const app = express();
app.use(cors()); // Para que los celulares puedan conectarse sin error
app.use(express.json());

// ==========================================
// TUS CONFIGURACIONES (Llená estos datos)
// ==========================================
const URL_TU_EXCEL_CSV = "ACA_PONE_EL_LINK_CSV_DE_TU_GOOGLE_SHEETS";
const TOKEN_SCANNTECH = "ACA_PONE_TU_TOKEN_DE_SCANNTECH"; // Ej: 'Basic ...' o 'Bearer ...'
const URL_API_SCANNTECH = "ACA_PONE_LA_URL_BASE_DE_SCANNTECH"; // Ej: 'https://api.scanntech.com'

let catalogoFresquito = []; 

// ==========================================
// EL MOTOR DE SINCRONIZACIÓN
// ==========================================
async function armarCatalogoMaestro() {
    try {
        console.log("Iniciando sincronización con Scanntech...");
        
        // 1. Bajamos el esqueleto (fotos y nombres) del Excel
        const respuestaExcel = await axios.get(URL_TU_EXCEL_CSV);
        const datosExcel = Papa.parse(respuestaExcel.data, { header: true, skipEmptyLines: true }).data;

        let catalogoTemporal = [];

        // 2. Por cada producto, buscamos su precio y stock real
        for (let producto of datosExcel) {
            if (!producto.codigo) continue; 

            try {
                const resScanntech = await axios.get(`${URL_API_SCANNTECH}/articulos/${producto.codigo}`, {
                    headers: { 'Authorization': TOKEN_SCANNTECH }
                });

                const dataScan = resScanntech.data;

                // 3. Unimos todo
                catalogoTemporal.push({
                    codigo: producto.codigo,
                    nombre: producto.nombre,
                    categoria: producto.categoria || "Otros",
                    subcategoria: producto.subcategoria || "General",
                    imagen: producto.imagen,
                    precio: parseFloat(dataScan.venta.valor) || 0, 
                    stockDisponible: parseInt(dataScan.totalStock.valor) || 0 
                });

            } catch (errorItem) {
                console.log(`Error buscando en Scanntech el código ${producto.codigo}`);
            }
        }

        // 4. Guardamos la info lista para usar
        catalogoFresquito = catalogoTemporal;
        console.log("¡Catálogo maestro actualizado con éxito!");

    } catch (errorGeneral) {
        console.error("Error fatal armando el catálogo", errorGeneral);
    }
}

// Arranca automático al prender el servidor
armarCatalogoMaestro();
// Y se repite cada 30 minutos (1800000 ms)
setInterval(armarCatalogoMaestro, 1800000);

// ==========================================
// LAS RUTAS DE TU SERVIDOR
// ==========================================

// Ruta A: La que lee la App de las doñas
app.get('/api/catalogo-juani', (req, res) => {
    res.json(catalogoFresquito);
});

// Ruta B: El botón de pánico de AppSheet
app.post('/api/sincronizar-manual', async (req, res) => {
    const clave = req.headers['authorization'];
    
    if (clave !== 'CHACHO_ADMIN_123') {
        return res.status(403).send("No tenés permiso.");
    }

    try {
        await armarCatalogoMaestro();
        res.send("Sincronización manual forzada con éxito.");
    } catch (error) {
        res.status(500).send("Error forzando la sincro.");
    }
});

// Prendemos el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Juani corriendo en el puerto ${PORT}`);
});
