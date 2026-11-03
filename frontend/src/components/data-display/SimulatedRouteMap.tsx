import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place, LocationOut } from '../../types/api';
import { MapPin, Info, Navigation } from 'lucide-react';

interface SimulatedRouteMapProps {
  origin: Place;
  destination: Place;
  currentLocation: LocationOut | null;
  height?: string | number;
}

// Custom DivIcon creator for Leaflet
function createMarkerIcon(color: string, label: string, isCurrent = false) {
  const pulseHtml = isCurrent
    ? `<span style="position: absolute; top: -6px; left: -6px; width: 36px; height: 36px; border-radius: 50%; background-color: ${color}; opacity: 0.25; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>`
    : '';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        ${pulseHtml}
        <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${color}; border: 2px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">
          ${label}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

export const SimulatedRouteMap: React.FC<SimulatedRouteMapProps> = ({
  origin,
  destination,
  currentLocation,
  height = '360px',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map if not yet created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear previous vector layers / markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const originLatLng: L.LatLngTuple = [origin.latitude, origin.longitude];
    const destLatLng: L.LatLngTuple = [destination.latitude, destination.longitude];

    // Marker 1: Origin
    const originMarker = L.marker(originLatLng, {
      icon: createMarkerIcon('#248A3D', 'A'),
    })
      .addTo(map)
      .bindPopup(`<strong>Kho xuất phát (Origin)</strong><br/>${origin.name}<br/>(${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)})`);

    // Marker 2: Destination
    const destMarker = L.marker(destLatLng, {
      icon: createMarkerIcon('#D70015', 'B'),
    })
      .addTo(map)
      .bindPopup(`<strong>Điểm đến (Destination)</strong><br/>${destination.name}<br/>(${destination.latitude.toFixed(4)}, ${destination.longitude.toFixed(4)})`);

    // Route Polyline (Dashed line)
    const routeLine = L.polyline([originLatLng, destLatLng], {
      color: '#007AFF',
      weight: 3,
      opacity: 0.6,
      dashArray: '6, 8',
    }).addTo(map);

    const boundsPoints: L.LatLngTuple[] = [originLatLng, destLatLng];

    // Marker 3: Current Position (if available)
    if (currentLocation) {
      const currentLatLng: L.LatLngTuple = [currentLocation.latitude, currentLocation.longitude];
      boundsPoints.push(currentLatLng);

      // Traveled segment
      L.polyline([originLatLng, currentLatLng], {
        color: '#007AFF',
        weight: 4,
        opacity: 0.9,
      }).addTo(map);

      L.marker(currentLatLng, {
        icon: createMarkerIcon('#007AFF', '🚛', true),
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup(`
          <strong>Vị trí mô phỏng hiện tại</strong><br/>
          Tiến độ: <strong>${currentLocation.progress_pct.toFixed(1)}%</strong><br/>
          Tọa độ: (${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)})<br/>
          <em>Nguồn: Backend Simulated</em>
        `)
        .openPopup();
    }

    // Fit map bounds with padding
    const bounds = L.latLngBounds(boundsPoints);
    map.fitBounds(bounds, { padding: [40, 40] });

    // Invalidate size in case of container sizing changes
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [origin, destination, currentLocation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Mandatory simulated location badge in map overlay */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(4px)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-pill)',
          padding: '4px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        }}
      >
        <Navigation size={12} style={{ color: 'var(--color-accent)' }} />
        <span>Vị trí mô phỏng từ Backend</span>
      </div>

      {/* Progress pill at bottom left */}
      {currentLocation && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            zIndex: 1000,
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(4px)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            fontSize: '12px',
            color: 'var(--color-text-primary)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          }}
        >
          Tiến độ tuyến: <strong>{currentLocation.progress_pct.toFixed(0)}%</strong>
        </div>
      )}
    </div>
  );
};

