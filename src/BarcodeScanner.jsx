import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'

const C = {
  accent: '#5C6B3A', accentLight: '#EDF0E4', muted: '#9A9590',
  text: '#1C1C1A', bg: '#F6F4EF', card: '#FFFFFF', border: '#ECEAE4',
  kcal: '#C0692A', protein: '#3D405B', carbs: '#6B9E7A', fat: '#B8922A',
  green: '#2E7D52', greenBg: '#E8F5EE',
}

// Hardcoded fallback product DB for demo (real app would hit Open Food Facts API)
const PRODUCT_DB = {
  '8906002490057': { name: 'MuscleBlaze Whey Protein (1 scoop)', kcal: 120, protein: 25, carbs: 3, fat: 2, servingSize: '33g' },
  '8901396040022': { name: 'Amul Taaza Toned Milk (200ml)', kcal: 116, protein: 7, carbs: 11, fat: 5, servingSize: '200ml' },
  '8901030802645': { name: 'Britannia Marie Gold (4 biscuits)', kcal: 120, protein: 2, carbs: 21, fat: 4, servingSize: '30g' },
  '0049000028911': { name: 'Coca-Cola (330ml)', kcal: 139, protein: 0, carbs: 35, fat: 0, servingSize: '330ml' },
}

async function lookupBarcode(code) {
  // Try Open Food Facts API (free, no key needed)
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
    const data = await res.json()
    if (data.status === 1 && data.product) {
      const p = data.product
      const n = p.nutriments
      return {
        name: p.product_name || p.abbreviated_product_name || 'Unknown product',
        kcal: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] / 100 * (p.serving_size_g || 100)),
        protein: Math.round((n['proteins_serving'] || n['proteins_100g'] / 100 * (p.serving_size_g || 100)) * 10) / 10,
        carbs: Math.round((n['carbohydrates_serving'] || n['carbohydrates_100g'] / 100 * (p.serving_size_g || 100)) * 10) / 10,
        fat: Math.round((n['fat_serving'] || n['fat_100g'] / 100 * (p.serving_size_g || 100)) * 10) / 10,
        servingSize: p.serving_size || '1 serving',
      }
    }
  } catch {}
  // Fallback to local DB
  return PRODUCT_DB[code] || null
}

export default function BarcodeScanner({ onClose, onAdd }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [phase, setPhase] = useState('scanning') // scanning | found | notfound
  const [product, setProduct] = useState(null)
  const [servings, setServings] = useState('1')
  const [lookingUp, setLookingUp] = useState(false)
  const [scannedCode, setScannedCode] = useState(null)

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader()
    readerRef.current.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      async (result, err) => {
        if (result && phase === 'scanning') {
          const code = result.getText()
          setScannedCode(code)
          setLookingUp(true)
          readerRef.current.reset()
          const found = await lookupBarcode(code)
          setLookingUp(false)
          if (found) { setProduct(found); setPhase('found') }
          else setPhase('notfound')
        }
      }
    )
    return () => { try { readerRef.current?.reset() } catch {} }
  }, [])

  const sv = parseFloat(servings) || 1
  const scaled = product ? {
    name: product.name,
    kcal: Math.round(product.kcal * sv),
    protein: Math.round(product.protein * sv * 10) / 10,
    carbs: Math.round(product.carbs * sv * 10) / 10,
    fat: Math.round(product.fat * sv * 10) / 10,
  } : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* Camera viewfinder */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted/>
        {/* Overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'scanning' && !lookingUp && (
            <>
              <style>{`@keyframes scanline{0%{top:20%}100%{top:80%}}`}</style>
              {/* Target box */}
              <div style={{ width: 260, height: 160, position: 'relative' }}>
                {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i) => (
                  <div key={i} style={{ position:'absolute', top:r?'auto':0, bottom:r?0:'auto', left:c?'auto':0, right:c?0:'auto', width:30, height:30, borderTop:r?'none':`3px solid ${C.accent}`, borderBottom:r?`3px solid ${C.accent}`:'none', borderLeft:c?'none':`3px solid ${C.accent}`, borderRight:c?`3px solid ${C.accent}`:'none', borderRadius:r&&c?'0 0 4px 0':r&&!c?'0 0 0 4px':!r&&c?'4px 0 0 0':'0 4px 0 0' }}/>
                ))}
                <div style={{ position:'absolute', left:0, right:0, height:2, background:`${C.accent}CC`, animation:'scanline 1.8s ease-in-out infinite alternate', boxShadow:`0 0 10px ${C.accent}` }}/>
              </div>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:'rgba(255,255,255,0.8)', marginTop:20 }}>Point at barcode — auto-detecting</p>
            </>
          )}
          {lookingUp && (
            <div style={{ background:'rgba(0,0,0,0.7)', borderRadius:16, padding:'20px 30px', textAlign:'center' }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:'#fff', margin:'0 0 6px' }}>Barcode detected!</p>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'rgba(255,255,255,0.6)', margin:0 }}>Looking up product…</p>
            </div>
          )}
          {phase === 'notfound' && (
            <div style={{ background:'rgba(0,0,0,0.8)', borderRadius:16, padding:'20px', textAlign:'center', maxWidth:280 }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:'#fff', margin:'0 0 8px' }}>Product not found</p>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:'rgba(255,255,255,0.6)', margin:'0 0 16px' }}>Code: {scannedCode}</p>
              <button onClick={() => { setPhase('scanning'); setScannedCode(null); readerRef.current = new BrowserMultiFormatReader(); readerRef.current.decodeFromConstraints({video:{facingMode:'environment'}}, videoRef.current, async (r) => { if(r) { const code=r.getText(); readerRef.current.reset(); setLookingUp(true); const found=await lookupBarcode(code); setLookingUp(false); if(found){setProduct(found);setPhase('found')}else setPhase('notfound') } }); }} style={{ background:C.accent, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer' }}>Try again</button>
            </div>
          )}
        </div>
        {/* Close button */}
        <button onClick={onClose} style={{ position:'absolute', top:50, right:16, width:36, height:36, borderRadius:18, background:'rgba(0,0,0,0.5)', border:'none', cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
      </div>

      {/* Product found sheet */}
      {phase === 'found' && product && (
        <div style={{ background:C.card, borderRadius:'24px 24px 0 0', padding:'20px 18px 40px', maxHeight:'55%', overflowY:'auto' }}>
          <div style={{ background:C.greenBg, border:`1px solid ${C.green}`, borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:C.green }}>✓</span>
            <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.green, fontWeight:500 }}>Product found!</span>
          </div>
          <div style={{ background:C.bg, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:600, color:C.text, margin:'0 0 3px' }}>{product.name}</p>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:C.muted, margin:'0 0 10px' }}>Per serving ({product.servingSize})</p>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ fontSize:12, color:C.kcal, fontWeight:600 }}>{product.kcal} kcal</span>
              <span style={{ fontSize:12, color:C.protein }}>P {product.protein}g</span>
              <span style={{ fontSize:12, color:C.carbs }}>C {product.carbs}g</span>
              <span style={{ fontSize:12, color:C.fat }}>F {product.fat}g</span>
            </div>
          </div>
          <label style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:C.muted, display:'block', marginBottom:8 }}>Servings</label>
          <div style={{ display:'flex', gap:6, marginBottom:14 }}>
            {['0.5','1','1.5','2'].map(s => (
              <button key={s} onClick={() => setServings(s)} style={{ flex:1, padding:'9px', border:`1.5px solid ${servings===s?C.accent:C.border}`, borderRadius:10, background:servings===s?C.accentLight:C.bg, color:servings===s?C.accent:C.muted, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:servings===s?600:400, cursor:'pointer' }}>{s}</button>
            ))}
            <input type="number" value={servings} onChange={e => setServings(e.target.value)} placeholder="Own" style={{ flex:1, padding:'9px', border:`1.5px solid ${C.border}`, borderRadius:10, background:C.bg, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.text, outline:'none', textAlign:'center' }}/>
          </div>
          {scaled && (
            <div style={{ background:C.accentLight, borderRadius:11, padding:'10px 14px', marginBottom:14 }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:C.accent, margin:'0 0 5px', fontWeight:600 }}>Total for {servings} serving{sv!==1?'s':''}</p>
              <div style={{ display:'flex', gap:12 }}>
                <span style={{ fontSize:13, color:C.kcal, fontWeight:700 }}>{scaled.kcal} kcal</span>
                <span style={{ fontSize:13, color:C.protein, fontWeight:600 }}>P {scaled.protein}g</span>
                <span style={{ fontSize:13, color:C.carbs }}>C {scaled.carbs}g</span>
                <span style={{ fontSize:13, color:C.fat }}>F {scaled.fat}g</span>
              </div>
            </div>
          )}
          <button onClick={() => { onAdd([scaled]); onClose(); }} style={{ width:'100%', background:C.accent, color:'#fff', border:'none', borderRadius:13, padding:'14px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, cursor:'pointer' }}>Add to meal</button>
        </div>
      )}
    </div>
  )
}
