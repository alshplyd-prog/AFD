import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  Phone,
  MessageCircle,
  X,
  Search,
  Crosshair,
  Filter,
  CheckCircle2,
  AlertCircle,
  Layers,
  MapPinned,
  ChevronRight,
  Eye,
  MapPin,
  Compass,
  Trash2,
  Radio,
  Receipt,
  ExternalLink,
  LocateFixed,
} from 'lucide-react';
import { InstallmentContract, CustomerList, SalesRepresentative, Language } from '../types';
import { updateCustomerLocation } from '../lib/postgresClient';
import { captureDeviceLocation } from '../lib/geolocationHelper';
import { OfflineTileLayer, precacheMapTilesForLocations } from '../lib/offlineTileLayer';
import { fetchStreetDrivingRoute } from '../lib/routingHelper';
import { registerBackHandler } from '../lib/backButtonManager';

// Check if a Leaflet map instance is currently mounted, valid, and has its DOM panes intact
const isMapValid = (map: L.Map | null | undefined): map is L.Map => {
  return Boolean(
    map &&
    (map as any)._mapPane &&
    (map as any)._container &&
    ((map as any)._loaded !== false)
  );
};

interface CustomerMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contracts: InstallmentContract[];
  customerLists: CustomerList[];
  currentRep: SalesRepresentative | null;
  isAdmin: boolean;
  lang?: Language;
  onSelectCustomer?: (contract: InstallmentContract) => void;
  initialCustomer?: InstallmentContract | null;
  autoDrawRoute?: boolean;
  onViewCustomerPayments?: (contract: InstallmentContract) => void;
}

interface LocationSearchBarProps {
  value: string;
  onSearchChange: (value: string) => void;
  isAr: boolean;
}

// Dedicated search bar that completely protects IME composition (Arabic input)
// and isolates typing from parent re-renders so text is never dropped or deleted
const LocationSearchBar: React.FC<LocationSearchBarProps> = React.memo(({
  value,
  onSearchChange,
  isAr,
}) => {
  const [localText, setLocalText] = useState(value);
  const isComposingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external clear
  useEffect(() => {
    if (value !== localText && !isComposingRef.current) {
      setLocalText(value);
    }
  }, [value]);

  const scheduleUpdate = (val: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearchChange(val);
    }, 250);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalText(val);
    if (!isComposingRef.current) {
      scheduleUpdate(val);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const val = e.currentTarget.value;
    setLocalText(val);
    scheduleUpdate(val);
  };

  const handleClear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocalText('');
    onSearchChange('');
  };

  return (
    <div className="relative w-full">
      <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={localText}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (timerRef.current) clearTimeout(timerRef.current);
            onSearchChange(localText);
          }
        }}
        placeholder={isAr ? 'بحث باسم الزبون، الهاتف، العنوان...' : 'Search customer name, phone, address...'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full text-xs sm:text-sm font-semibold bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-400 rounded-2xl pr-9 pl-9 py-2 focus:outline-none focus:border-emerald-500 shadow-inner"
      />
      {localText ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
});

export const CustomerMapsModal: React.FC<CustomerMapsModalProps> = ({
  isOpen,
  onClose,
  contracts = [],
  customerLists = [],
  currentRep,
  isAdmin,
  lang = 'ar',
  onSelectCustomer,
  initialCustomer = null,
  autoDrawRoute = false,
  onViewCustomerPayments,
}) => {
  const isAr = lang === 'ar';
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRotationWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const watchPositionIdRef = useRef<number | null>(null);
  
  // Navigation & Turn Tracking Refs
  const currentCourseRef = useRef<number>(0);
  const smoothedHeadingRef = useRef<number>(0);
  const lastHeadingUpdateRef = useRef<number>(0);
  const positionHistoryRef = useRef<Array<{ lat: number; lng: number; time: number }>>([]);
  const lastValidLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const userCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const routeLatLngsRef = useRef<[number, number][]>([]);
  const isUserManuallyPanningRef = useRef<boolean>(false);
  const hasFittedInitialBoundsRef = useRef<boolean>(false);
  const prevSelectedListIdRef = useRef<string>('all');

  // In-App Route State (عرض المسار على نفس الخريطة)
  const [activeRoute, setActiveRoute] = useState<{
    contract: InstallmentContract;
    distanceMeters: number;
    durationSeconds: number;
    isOfflineFallback: boolean;
  } | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);

  // Calculate distance in meters between two lat/lng coordinates (Haversine)
  const calculateDistanceMeters = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Calculate forward azimuth/bearing in degrees (0..360) between two points
  const calculateBearing = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }, []);

  // Helper to extract valid coords from a contract (supports latitude/longitude or lat/lng)
  const getCustomerCoords = useCallback((c: InstallmentContract): { lat: number; lng: number } | null => {
    const lat = Number(c.latitude ?? (c as any).lat);
    const lng = Number(c.longitude ?? (c as any).lng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
    return { lat, lng };
  }, []);

  const headingBadgeRef = useRef<HTMLDivElement | null>(null);
  const headingDegreeTextRef = useRef<HTMLSpanElement | null>(null);

  // Filter state - Default sidebar closed so MAP is immediately full-screen
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'has_location' | 'no_location' | 'active_debt' | 'completed'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<InstallmentContract | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isLocatingUser, setIsLocatingUser] = useState<boolean>(false);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);
  const userSpeedRef = useRef<number | null>(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Register Hardware / Gesture Back Button handling for maps & bottom sheet
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler(() => {
      // 1. If sidebar list is open, close sidebar
      if (isSidebarOpen) {
        setIsSidebarOpen(false);
        return true;
      }
      // 2. If customer details bottom sheet is open, close it
      if (selectedCustomer) {
        setSelectedCustomer(null);
        return true;
      }
      // 3. Otherwise close the entire maps modal
      onClose();
      return true;
    });

    return unregister;
  }, [isOpen, isSidebarOpen, selectedCustomer, onClose]);

  // Check if rep is allowed to see a given list - strict access control
  const isListAllowed = (listId?: string | null): boolean => {
    if (isAdmin) return true;
    if (!currentRep) return true;
    if (currentRep.role === 'admin' || currentRep.role === 'supervisor') return true;
    if (currentRep.allowedListIds && currentRep.allowedListIds.includes('all')) return true;
    if (!listId) return false;
    if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0) return false;
    return currentRep.allowedListIds.includes(listId);
  };

  // Filter customer lists allowed for this user
  const allowedCustomerLists = useMemo(() => {
    return customerLists.filter((list) => isListAllowed(list.id));
  }, [customerLists, currentRep, isAdmin]);

  // Accessible contracts based on allowed lists
  const accessibleContracts = useMemo(() => {
    return contracts.filter((c) => isListAllowed(c.listId));
  }, [contracts, currentRep, isAdmin]);

  // Filtered contracts according to modal search & filters
  const filteredContracts = useMemo(() => {
    return accessibleContracts.filter((c) => {
      // List filter
      if (selectedListId !== 'all' && c.listId !== selectedListId) {
        return false;
      }

      // Status filter
      const coords = getCustomerCoords(c);
      const hasCoords = coords !== null;
      if (statusFilter === 'has_location' && !hasCoords) return false;
      if (statusFilter === 'no_location' && hasCoords) return false;
      if (statusFilter === 'active_debt' && (c.remainingBalance <= 0 || c.status === 'completed')) return false;
      if (statusFilter === 'completed' && c.status !== 'completed' && c.remainingBalance > 0) return false;

      // Search query (debounced to prevent keyboard input resets)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const nameMatch = c.customerName && c.customerName.toLowerCase().includes(query);
        const phoneMatch = c.customerPhone && c.customerPhone.includes(query);
        const addressMatch = c.customerAddress && c.customerAddress.toLowerCase().includes(query);
        const itemMatch = c.itemName && c.itemName.toLowerCase().includes(query);
        if (!nameMatch && !phoneMatch && !addressMatch && !itemMatch) return false;
      }

      return true;
    });
  }, [accessibleContracts, selectedListId, statusFilter, searchQuery, getCustomerCoords]);

  // Contracts with valid coordinates to show on the map
  const contractsOnMap = useMemo(() => {
    return filteredContracts.filter((c) => getCustomerCoords(c) !== null);
  }, [filteredContracts, getCustomerCoords]);

  // Count summary
  const totalWithLocation = useMemo(() => {
    return accessibleContracts.filter((c) => getCustomerCoords(c) !== null).length;
  }, [accessibleContracts, getCustomerCoords]);

  // Show temporary toast inside modal
  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Helper to create custom HTML pin icon with permanently visible customer name
  // Labels are counter-rotated using CSS variable --counter-rotate so they ALWAYS remain level and upright
  const createCustomPinIcon = useCallback((contract: InstallmentContract, isSelected: boolean) => {
    const isCompleted = contract.status === 'completed' || contract.remainingBalance <= 0;
    const isLate = contract.status === 'late';
    
    let bgClass = 'bg-emerald-600 text-white border-white';
    let ringClass = 'ring-emerald-500/30';
    let dotColor = 'bg-emerald-400';
    if (isCompleted) {
      bgClass = 'bg-blue-600 text-white border-white';
      ringClass = 'ring-blue-500/30';
      dotColor = 'bg-blue-400';
    } else if (isLate) {
      bgClass = 'bg-rose-600 text-white border-white';
      ringClass = 'ring-rose-500/30';
      dotColor = 'bg-rose-400';
    }

    const scaleClass = isSelected ? 'scale-125 z-50 ring-4' : 'hover:scale-110';
    const initialLetter = (contract.customerName || 'ز').trim().charAt(0);

    return L.divIcon({
      className: 'custom-customer-pin',
      html: `
        <div class="custom-customer-pin-inner relative flex flex-col items-center group cursor-pointer transition-transform duration-200 ${scaleClass}" style="transform: rotate(var(--counter-rotate, 0deg)); transform-origin: 50% 80%; will-change: transform;">
          <!-- Customer Full Name Badge (Permanently Visible & Always Upright) -->
          <div class="px-2.5 py-1 mb-1 bg-slate-950/95 text-white text-[11px] font-black rounded-xl shadow-xl border border-slate-700/90 flex items-center justify-center gap-1.5 whitespace-nowrap pointer-events-none drop-shadow-md">
            <span class="w-2 h-2 rounded-full ${dotColor} shrink-0"></span>
            <span class="max-w-[150px] truncate text-white">${contract.customerName}</span>
          </div>
          <!-- Pin Circle -->
          <div class="w-9 h-9 rounded-full ${bgClass} border-2 shadow-lg flex items-center justify-center font-black text-sm ${ringClass}">
            ${initialLetter}
          </div>
          <div class="w-2.5 h-2.5 bg-slate-900 rotate-45 -mt-1 shadow-xs"></div>
        </div>
      `,
      iconSize: [200, 72],
      iconAnchor: [100, 70],
      popupAnchor: [0, -66],
    });
  }, []);

  // Update user marker with GPS Navigation Chevron
  const updateUserMarker = useCallback((lat: number, lng: number, speedVal: number | null) => {
    const map = mapInstanceRef.current;
    if (!isMapValid(map)) return;

    const headingArrowHtml = `
      <div class="relative flex flex-col items-center select-none pointer-events-none">
        <div class="user-gps-badge px-2.5 py-0.5 mb-1.5 bg-blue-600 text-white font-black text-[10px] rounded-full shadow-lg whitespace-nowrap border border-blue-400" style="transform: rotate(var(--counter-rotate, 0deg)); transform-origin: 50% 50%; will-change: transform;">
          🎯 موقعي ${speedVal && speedVal > 0.5 ? `(${(speedVal * 3.6).toFixed(0)} كم/س)` : ''}
        </div>
        <div class="relative flex items-center justify-center">
          <!-- Direction Chevron pointing in direction of travel -->
          <div class="user-gps-arrow relative w-10 h-10 flex items-center justify-center transform transition-transform duration-200" style="transform: rotate(var(--user-arrow-rot, 0deg)); transform-origin: 50% 50%; will-change: transform;">
            <svg viewBox="0 0 24 24" class="w-9 h-9 drop-shadow-[0_2px_8px_rgba(37,99,235,0.7)]" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2" />
            </svg>
          </div>
          <!-- Pulsating center dot -->
          <div class="absolute w-4 h-4 bg-blue-400 rounded-full animate-ping opacity-60"></div>
          <div class="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-blue-600"></div>
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'user-gps-marker',
      html: headingArrowHtml,
      iconSize: [120, 70],
      iconAnchor: [60, 52],
    });

    try {
      if (userMarkerRef.current && (userMarkerRef.current as any)._map === map) {
        userMarkerRef.current.setLatLng([lat, lng]);
        userMarkerRef.current.setIcon(userIcon);
      } else {
        if (userMarkerRef.current) {
          try { userMarkerRef.current.remove(); } catch (e) {}
        }
        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      }
    } catch (e) {}
  }, []);

  // Smooth GPS motion heading update engine (Pure GPS velocity/displacement - Zero compass jitter)
  // Direct DOM transform updates guarantee 60fps rotation without triggering component re-renders or dropping input focus
  const applyHeadingUpdate = useCallback((newDeg: number) => {
    const now = Date.now();
    if (now - lastHeadingUpdateRef.current < 200) return;

    const current = smoothedHeadingRef.current || currentCourseRef.current || 0;
    const diff = ((((newDeg - current) % 360) + 540) % 360) - 180;

    // Deadband threshold: ignore minor jitter (< 5 deg)
    if (Math.abs(diff) < 5.0) return;

    const smoothed = Math.round((current + diff * 0.5 + 360) % 360);

    currentCourseRef.current = smoothed;
    smoothedHeadingRef.current = smoothed;
    lastHeadingUpdateRef.current = now;

    if (mapRotationWrapperRef.current) {
      mapRotationWrapperRef.current.style.transform = `translate(-50%, -50%) rotate(${-smoothed}deg)`;
      mapRotationWrapperRef.current.style.setProperty('--counter-rotate', `${smoothed}deg`);
      mapRotationWrapperRef.current.style.setProperty('--user-arrow-rot', `${smoothed}deg`);
    }

    if (headingBadgeRef.current) {
      if (smoothed !== 0) {
        headingBadgeRef.current.style.display = 'flex';
        if (headingDegreeTextRef.current) {
          headingDegreeTextRef.current.textContent = `${smoothed}°`;
        }
      } else {
        headingBadgeRef.current.style.display = 'none';
      }
    }
  }, []);

  // Pre-cache customer map tiles in the background
  useEffect(() => {
    if (contracts && contracts.length > 0) {
      precacheMapTilesForLocations(contracts);
    }
  }, [contracts]);

  // Initialize Leaflet Map once when modal opens, destroy cleanly when modal closes
  useEffect(() => {
    if (!isOpen) return;

    let isDisposed = false;
    let timer1: any = null;
    let timer2: any = null;
    let timer3: any = null;

    const initMap = () => {
      if (isDisposed || !mapContainerRef.current) return;

      if (mapInstanceRef.current && isMapValid(mapInstanceRef.current)) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) {}
        return;
      }

      try {
        // Determine instantaneous starting center and zoom coordinates directly on first frame
        let initLat = 33.3152;
        let initLng = 44.3661;
        let initZoom = 14;

        const initCustomerCoords = initialCustomer ? getCustomerCoords(initialCustomer) : null;
        if (initCustomerCoords) {
          initLat = initCustomerCoords.lat;
          initLng = initCustomerCoords.lng;
          initZoom = 16;
        } else if (userCoordsRef.current) {
          initLat = userCoordsRef.current.lat;
          initLng = userCoordsRef.current.lng;
          initZoom = 15;
        } else if (contractsOnMap.length > 0) {
          const firstWithCoords = contractsOnMap.find((c) => getCustomerCoords(c) != null);
          const firstCoords = firstWithCoords ? getCustomerCoords(firstWithCoords) : null;
          if (firstCoords) {
            initLat = firstCoords.lat;
            initLng = firstCoords.lng;
            initZoom = 14;
          }
        }

        const map = L.map(mapContainerRef.current, {
          center: [initLat, initLng],
          zoom: initZoom,
          zoomControl: false,
          preferCanvas: true,
        });

        const offlineTileLayer = new OfflineTileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            keepBuffer: 12,
            updateWhenIdle: false,
            updateWhenZooming: false,
            attribution: '&copy; OpenStreetMap contributors',
          }
        );
        offlineTileLayer.addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;

        const routeLayer = L.layerGroup().addTo(map);
        routeLayerRef.current = routeLayer;

        map.on('dragstart', () => {
          isUserManuallyPanningRef.current = true;
        });

        mapInstanceRef.current = map;

        try {
          map.invalidateSize();
        } catch (e) {}
      } catch (err) {
        console.warn('Map init notice:', err);
      }
    };

    initMap();

    timer1 = setTimeout(() => {
      if (!isDisposed && isMapValid(mapInstanceRef.current)) {
        try { mapInstanceRef.current.invalidateSize(); } catch (e) {}
      }
    }, 60);

    timer2 = setTimeout(() => {
      if (!isDisposed && isMapValid(mapInstanceRef.current)) {
        try { mapInstanceRef.current.invalidateSize(); } catch (e) {}
      }
    }, 200);

    timer3 = setTimeout(() => {
      if (!isDisposed && isMapValid(mapInstanceRef.current)) {
        try { mapInstanceRef.current.invalidateSize(); } catch (e) {}
      }
    }, 450);

    return () => {
      isDisposed = true;
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      if (watchPositionIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);
        watchPositionIdRef.current = null;
      }

      userMarkerRef.current = null;
      markersLayerRef.current = null;
      routeLayerRef.current = null;

      if (mapInstanceRef.current) {
        const mapToDestroy = mapInstanceRef.current;
        mapInstanceRef.current = null;
        try {
          mapToDestroy.stop();
          mapToDestroy.remove();
        } catch (e) {}
      }
    };
  }, [isOpen]);

  // Request device location in background on open to display user marker without hiding customers
  useEffect(() => {
    if (!isOpen) return;

    captureDeviceLocation().then((res) => {
      if (res.location) {
        const { latitude, longitude } = res.location;
        userCoordsRef.current = { lat: latitude, lng: longitude };
        try {
          localStorage.setItem('alkarrar_last_user_location', JSON.stringify({ lat: latitude, lng: longitude }));
        } catch (e) {}
        updateUserMarker(latitude, longitude, null);
      }
    }).catch(() => {});
  }, [isOpen, updateUserMarker]);

  // Try loading last known location from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('alkarrar_last_user_location');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.lat && parsed?.lng) {
          userCoordsRef.current = { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch (e) {}
  }, []);

  // Handle initialCustomer if passed and auto-draw street route if requested
  useEffect(() => {
    if (isOpen && initialCustomer) {
      setSelectedCustomer(initialCustomer);
      const coords = getCustomerCoords(initialCustomer);
      if (coords) {
        if (autoDrawRoute) {
          const routeTimer = setTimeout(() => {
            handleDrawRouteToCustomer(initialCustomer);
          }, 80);
          return () => clearTimeout(routeTimer);
        } else {
          const timer = setTimeout(() => {
            if (isMapValid(mapInstanceRef.current)) {
              try {
                mapInstanceRef.current.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 });
              } catch (e) {}
            }
          }, 100);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [isOpen, initialCustomer, autoDrawRoute, getCustomerCoords]);

  // Reset initial bounds fitting when modal opens
  useEffect(() => {
    if (isOpen) {
      hasFittedInitialBoundsRef.current = false;
    }
  }, [isOpen]);

  // Display all customer locations on modal open or filter changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!isMapValid(map) || !markersLayer) return;

    try {
      markersLayer.clearLayers();
    } catch (e) {
      return;
    }

    if (contractsOnMap.length === 0) {
      return;
    }

    const bounds: L.LatLngExpression[] = [];

    contractsOnMap.forEach((contract) => {
      const coords = getCustomerCoords(contract);
      if (!coords) return;

      bounds.push([coords.lat, coords.lng]);

      const isSelected = selectedCustomer?.id === contract.id;
      const icon = createCustomPinIcon(contract, isSelected);

      try {
        const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(markersLayer);
        marker.on('click', () => {
          setSelectedCustomer(contract);
          if (isMapValid(mapInstanceRef.current)) {
            try {
              mapInstanceRef.current.panTo([coords.lat, coords.lng]);
            } catch (e) {}
          }
        });
      } catch (e) {}
    });

    // Only auto-fit map view on initial modal open or list dropdown change, NEVER on keystrokes
    const listChanged = prevSelectedListIdRef.current !== selectedListId;
    if (listChanged) {
      prevSelectedListIdRef.current = selectedListId;
      hasFittedInitialBoundsRef.current = false;
    }

    if (bounds.length > 0 && !selectedCustomer && !hasFittedInitialBoundsRef.current && isMapValid(map)) {
      hasFittedInitialBoundsRef.current = true;
      try {
        if (bounds.length === 1) {
          map.setView(bounds[0], 16);
        } else {
          map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 16 });
        }
      } catch (e) {}
    }
  }, [contractsOnMap, selectedCustomer, selectedListId, createCustomPinIcon, getCustomerCoords]);

  // Start Live Real-Time Navigation Tracking & Heading
  const startLiveTracking = useCallback(async (isAutoStart: boolean = false) => {
    if (watchPositionIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchPositionIdRef.current);
      watchPositionIdRef.current = null;
    }

    if (!isAutoStart) setIsLocatingUser(true);
    const initialPos = await captureDeviceLocation();
    if (!isAutoStart) setIsLocatingUser(false);

    if (!initialPos.location) {
      if (!isAutoStart) {
        showFeedback(isAr ? (initialPos.error?.messageAr || 'تعذر تحديد الموقع') : 'Location unavailable');
      }
      return;
    }

    const { latitude, longitude } = initialPos.location;
    userCoordsRef.current = { lat: latitude, lng: longitude };
    lastValidLocationRef.current = { lat: latitude, lng: longitude };
    positionHistoryRef.current = [{ lat: latitude, lng: longitude, time: Date.now() }];
    updateUserMarker(latitude, longitude, null);

    const map = mapInstanceRef.current;
    if (isMapValid(map) && !isUserManuallyPanningRef.current && !selectedCustomer) {
      try {
        map.flyTo([latitude, longitude], 17, { duration: 1 });
      } catch (e) {}
    }

    setIsLiveTracking(true);

    // Start continuous live GPS watcher with accurate movement filtering (Zero stationary jitter)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchPositionIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speed = pos.coords.speed;
          const rawHeading = pos.coords.heading;
          userSpeedRef.current = speed;
          userCoordsRef.current = { lat, lng };

          const lastAnchor = lastValidLocationRef.current;
          const distFromAnchor = lastAnchor ? calculateDistanceMeters(lastAnchor.lat, lastAnchor.lng, lat, lng) : 999;
          
          // Determine if user is genuinely moving (speed >= 0.8 m/s or displacement >= 3.5 meters)
          const isGenuineMovement = (speed !== null && speed >= 0.8) || (distFromAnchor >= 3.5);

          if (isGenuineMovement) {
            const now = Date.now();
            const history = positionHistoryRef.current;
            history.push({ lat, lng, time: now });
            if (history.length > 5) {
              history.shift();
            }

            // Calculate motion bearing when turning right, left, or returning
            if (history.length >= 2) {
              const oldest = history[0];
              const moveDist = calculateDistanceMeters(oldest.lat, oldest.lng, lat, lng);
              if (moveDist >= 3.0) {
                const motionBearing = calculateBearing(oldest.lat, oldest.lng, lat, lng);
                applyHeadingUpdate(motionBearing);
              }
            } else if (rawHeading !== null && rawHeading !== undefined && !isNaN(rawHeading) && rawHeading >= 0 && (speed === null || speed >= 0.8)) {
              applyHeadingUpdate(rawHeading);
            }

            lastValidLocationRef.current = { lat, lng };
            updateUserMarker(lat, lng, speed);

            // Smooth camera follow only when moving
            if (!isUserManuallyPanningRef.current && isMapValid(mapInstanceRef.current)) {
              try {
                mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom(), { animate: false });
              } catch (e) {}
            }
          }
        },
        (err) => {
          console.warn('Live watch error:', err);
        },
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
      );
    }
  }, [applyHeadingUpdate, calculateBearing, calculateDistanceMeters, isAr, selectedCustomer, updateUserMarker]);

  // Automatically start live tracking and choose location when modal opens
  useEffect(() => {
    if (!isOpen) return;
    isUserManuallyPanningRef.current = false;
    const timer = setTimeout(() => {
      startLiveTracking(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [isOpen, startLiveTracking]);

  // Center on User button handler: resets manual panning and snaps view to user
  const handleCenterOnUser = () => {
    isUserManuallyPanningRef.current = false;
    const map = mapInstanceRef.current;
    if (userCoordsRef.current && isMapValid(map)) {
      try {
        map.flyTo([userCoordsRef.current.lat, userCoordsRef.current.lng], 17, { duration: 0.8 });
      } catch (e) {}
    }
    if (!isLiveTracking) {
      startLiveTracking(false);
    }
    showFeedback(isAr ? 'تم توسيط موقعك 🎯' : 'Centered on location');
  };

  // Draw Driving Route to Customer directly on the in-app map (رسم مسار الشوارع الفعلي)
  const handleDrawRouteToCustomer = async (contract: InstallmentContract) => {
    const coords = getCustomerCoords(contract);
    if (!coords) {
      showFeedback(isAr ? 'هذا الزبون لا يملك إحداثيات موقع' : 'No coordinates for customer');
      return;
    }

    setIsLoadingRoute(true);
    setSelectedCustomer(contract);

    // Get current user location with robust multi-tiered fallback so routing is NEVER inactive
    let userPos = userCoordsRef.current;
    if (!userPos) {
      try {
        const storedLoc = localStorage.getItem('alkarrar_last_user_location');
        if (storedLoc) {
          const parsed = JSON.parse(storedLoc);
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            userPos = { lat: parsed.lat, lng: parsed.lng };
            userCoordsRef.current = userPos;
          }
        }
      } catch (e) {}
    }

    if (!userPos) {
      // Try fast GPS capture
      try {
        const loc = await captureDeviceLocation();
        if (loc.location) {
          userPos = { lat: loc.location.latitude, lng: loc.location.longitude };
          userCoordsRef.current = userPos;
          try {
            localStorage.setItem('alkarrar_last_user_location', JSON.stringify(userPos));
          } catch (e) {}
          if (isMapValid(mapInstanceRef.current)) {
            updateUserMarker(userPos.lat, userPos.lng, null);
          }
        }
      } catch (e) {}
    }

    // Fallback to map center so drawing the street route is NEVER blocked or inactive
    if (!userPos) {
      const map = mapInstanceRef.current;
      if (isMapValid(map)) {
        const center = map.getCenter();
        userPos = { lat: center.lat, lng: center.lng };
        userCoordsRef.current = userPos;
        updateUserMarker(userPos.lat, userPos.lng, null);
        showFeedback(isAr ? '📍 تم بدء المسار من مركز الخريطة (جاري جلب إشارة GPS)' : 'Route started from map center, acquiring GPS...');
      }
    }

    if (!userPos) {
      setIsLoadingRoute(false);
      showFeedback(isAr ? 'تعذر تحديد موقع الانطلاق لرسم المسار' : 'Could not determine route start location');
      return;
    }

    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!isMapValid(map) || !routeLayer) {
      setIsLoadingRoute(false);
      return;
    }

    try {
      routeLayer.clearLayers();

      // Fetch driving street route using our multi-tiered street routing engine (OSRM)
      const routeResult = await fetchStreetDrivingRoute(userPos, coords);

      if (!routeResult.success || !routeResult.coordinates || routeResult.coordinates.length < 2) {
        showFeedback(
          isAr
            ? '⚠️ تعذر تحميل مسار الشوارع بسبب ضعف شبكة الإنترنت. يرجى إعادة المحاولة'
            : 'Could not load street route. Please check connection and retry.'
        );
        return;
      }

      const routeLatLngs = routeResult.coordinates;
      routeLatLngsRef.current = routeLatLngs;
      const distMeters = routeResult.distance;
      const durationSec = routeResult.duration;

      // Draw high-visibility street navigation route lines (على الشوارع ومسارات السير الحقيقية - ليست خطوط مستقيمة):
      // 1. Dark wide shadow base
      L.polyline(routeLatLngs, {
        color: '#0f172a',
        weight: 10,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      // 2. High-contrast road border casing (Royal blue)
      L.polyline(routeLatLngs, {
        color: '#1d4ed8',
        weight: 7,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      // 3. Main vibrant navigation line (Electric blue)
      L.polyline(routeLatLngs, {
        color: '#38bdf8',
        weight: 4.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      // 4. Highlight origin point (Start)
      L.circleMarker([userPos.lat, userPos.lng], {
        radius: 7,
        fillColor: '#22c55e',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(routeLayer);

      // 5. Highlight destination point with a distinct marker (End)
      L.circleMarker([coords.lat, coords.lng], {
        radius: 8,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(routeLayer);

      // Fit map bounds to show route clearly
      const boundsPoly = L.polyline(routeLatLngs);
      map.fitBounds(boundsPoly.getBounds(), { padding: [60, 60], maxZoom: 16 });

      setActiveRoute({
        contract,
        distanceMeters: distMeters,
        durationSeconds: durationSec,
        isOfflineFallback: false,
      });

      // Close customer popup window and sidebar automatically when route is drawn
      setSelectedCustomer(null);
      setIsSidebarOpen(false);

      const distText = distMeters < 1000 ? `${distMeters} م` : `${(distMeters / 1000).toFixed(1)} كم`;
      const mins = Math.max(1, Math.ceil(durationSec / 60));
      showFeedback(
        isAr
          ? `🚗 تم رسم مسار الشوارع (${distText} - حوالي ${mins} دقيقة بالسيارة)`
          : `Street driving route drawn (${distText} - ~${mins} mins) 🚗`
      );
    } catch (err) {
      console.warn('Route drawing error:', err);
      showFeedback(isAr ? 'حدث خطأ أثناء رسم مسار الشوارع' : 'Error drawing street route');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Clear in-app route
  const handleClearRoute = () => {
    if (routeLayerRef.current) {
      try {
        routeLayerRef.current.clearLayers();
      } catch (e) {}
    }
    routeLatLngsRef.current = [];
    setActiveRoute(null);
  };

  // Delete Customer Location (زر حذف للموقع - للمدير فقط مع المزامنة)
  const handleRemoveLocation = async (contractId: string) => {
    if (!isAdmin) {
      showFeedback(isAr ? 'عذراً، صلاحية حذف الموقع متاحة للمدير فقط' : 'Location deletion is restricted to Admin only');
      return;
    }
    if (!window.confirm(isAr ? 'هل تريد حذف موقع هذا الزبون ومزامنته مع السيرفر وكافة الأجهزة؟ (سيُطلب تسجيل موقعه عند الدفعة القادمة)' : 'Are you sure you want to remove this location across all devices?')) {
      return;
    }
    try {
      setIsUpdatingLocation(true);
      await updateCustomerLocation(contractId, null, null, '');
      setIsUpdatingLocation(false);
      setSelectedCustomer(null);
      showFeedback(isAr ? 'تم حذف الموقع ومزامنته مع السيرفر والأجهزة ✅' : 'Location removed and synced with server');
    } catch (e) {
      setIsUpdatingLocation(false);
      showFeedback(isAr ? 'حدث خطأ أثناء الحذف' : 'Error removing location');
    }
  };

  // Fly to customer on map
  const handleFlyToCustomer = (contract: InstallmentContract) => {
    setSelectedCustomer(contract);
    const coords = getCustomerCoords(contract);
    if (coords && isMapValid(mapInstanceRef.current)) {
      try {
        mapInstanceRef.current.flyTo([coords.lat, coords.lng], 17, { duration: 1.2 });
      } catch (e) {}
    }
  };

  // Open Google Maps Directions
  const openGoogleMapsDirections = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 dir-rtl">
      <div className="relative w-full h-full max-w-7xl max-h-[100dvh] sm:max-h-[94vh] bg-slate-900 border border-slate-700/80 rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Top Full-Width Control Bar (اختيار القوائم والبحث على عرض الشاشة بدلاً من الشريط القديم) */}
        <div className="w-full px-3 sm:px-5 py-2.5 bg-slate-900/95 border-b border-slate-700/80 shrink-0 space-y-2 z-30 shadow-md">
          {/* Row 1: اختيار القائمة + زر الإغلاق */}
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 flex items-center gap-2 bg-slate-800 border border-slate-700/90 rounded-2xl px-3 py-1.5 focus-within:border-emerald-500 shadow-inner">
              <Filter className="w-4 h-4 text-emerald-400 shrink-0" />
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full text-xs sm:text-sm font-black bg-transparent text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white font-bold">
                  {isAr ? 'جميع الزبائن (كل القوائم)' : 'All Customers'} ({accessibleContracts.length})
                </option>
                {allowedCustomerLists.map((list) => {
                  const count = accessibleContracts.filter((c) => c.listId === list.id).length;
                  return (
                    <option key={list.id} value={list.id} className="bg-slate-900 text-white font-bold">
                      {list.name} ({count})
                    </option>
                  );
                })}
              </select>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                {contractsOnMap.length} {isAr ? 'موقع' : 'pins'}
              </span>
            </div>

            {/* Toggle Drawer */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="p-2 rounded-2xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
              title={isAr ? 'قائمة الزبائن' : 'Customer list'}
            >
              <Layers className="w-4 h-4" />
            </button>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer shrink-0 active:scale-95"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Row 2: حقل البحث المقاوم لمشاكل الكيبورد وحذف النص */}
          <LocationSearchBar
            value={searchQuery}
            onSearchChange={setSearchQuery}
            isAr={isAr}
          />
        </div>

        {/* Temporary Feedback Notification Toast */}
        {feedbackMessage && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-600 text-white text-xs sm:text-sm font-black rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
            <CheckCircle2 className="w-4 h-4" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Main Content Area: Map Takes Full Screen Immediately */}
        <div className="relative flex-1 w-full h-full overflow-hidden flex flex-row">
          
          {/* Map Container */}
          <div className="relative flex-1 w-full h-full bg-slate-950 overflow-hidden">
            <style>{`
              .custom-customer-pin-inner {
                transform: rotate(var(--counter-rotate, 0deg)) !important;
                transform-origin: 50% 80% !important;
                transition: transform 0.2s ease-out !important;
              }
              .user-gps-badge {
                transform: rotate(var(--counter-rotate, 0deg)) !important;
                transform-origin: 50% 50% !important;
                transition: transform 0.2s ease-out !important;
              }
              .user-gps-arrow {
                transform: rotate(var(--user-arrow-rot, 0deg)) !important;
                transform-origin: 50% 50% !important;
                transition: transform 0.2s ease-out !important;
              }
            `}</style>

            {/* Map Wrapper: Permanent centered rotation with GPS travel direction */}
            <div
              ref={mapRotationWrapperRef}
              className="absolute"
              style={{
                top: '50%',
                left: '50%',
                width: '240vmax',
                height: '240vmax',
                transform: 'translate(-50%, -50%) rotate(0deg)',
                transformOrigin: '50% 50%',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                transition: 'transform 0.35s cubic-bezier(0.2, 0.9, 0.4, 1)',
                '--counter-rotate': '0deg',
                '--user-arrow-rot': '0deg',
              } as React.CSSProperties}
            >
              <div ref={mapContainerRef} className="w-full h-full z-0" />
            </div>

            {/* GPS Direction / Movement Badge in Top-Right */}
            <div
              ref={headingBadgeRef}
              style={{ display: 'none' }}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700/80 shadow-2xl"
            >
              <Navigation className="w-3.5 h-3.5 text-amber-400 transform transition-transform" />
              <span ref={headingDegreeTextRef} className="text-xs font-black text-amber-400 font-mono">0°</span>
              <span className="text-[10px] font-bold text-slate-300">{isAr ? 'تدوير مع المسار' : 'Heading-Up'}</span>
            </div>

            {/* Primary "موقعي" + "مسار الشوارع النشط" Buttons at Bottom of the Map */}
            <div className="absolute bottom-4 right-3 left-3 z-20 flex items-center justify-between pointer-events-none">
              {/* Active Street Route Banner */}
              {activeRoute ? (
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md rounded-2xl border-2 border-blue-500/80 shadow-2xl pointer-events-auto max-w-[calc(100%-110px)] animate-in fade-in slide-in-from-bottom-2">
                  <div className="px-2 py-1 text-xs font-black text-white flex items-center gap-1.5 min-w-0">
                    <Navigation className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-xs font-black text-white">
                        {activeRoute.contract.customerName}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-blue-300 font-bold">
                        <span>
                          {activeRoute.distanceMeters < 1000
                            ? `${activeRoute.distanceMeters} م`
                            : `${(activeRoute.distanceMeters / 1000).toFixed(1)} كم`}
                        </span>
                        <span className="opacity-80">
                          (~{Math.max(1, Math.ceil(activeRoute.durationSeconds / 60))} {isAr ? 'دقيقة' : 'min'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Re-center / Fit Route */}
                  <button
                    type="button"
                    onClick={() => {
                      const map = mapInstanceRef.current;
                      if (isMapValid(map) && routeLatLngsRef.current.length > 0) {
                        try {
                          map.fitBounds(L.polyline(routeLatLngsRef.current).getBounds(), { padding: [60, 60], maxZoom: 16 });
                        } catch (e) {}
                      }
                    }}
                    className="p-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                    title={isAr ? 'إعادة توسيط كامل المسار' : 'Fit Route'}
                  >
                    <LocateFixed className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden md:inline">{isAr ? 'المسار' : 'Fit'}</span>
                  </button>

                  {/* Open in Google Maps navigation */}
                  <button
                    type="button"
                    onClick={() => {
                      const cCoords = getCustomerCoords(activeRoute.contract);
                      if (!cCoords) return;
                      const userPos = userCoordsRef.current;
                      const originParam = userPos ? `origin=${userPos.lat},${userPos.lng}&` : '';
                      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&${originParam}destination=${cCoords.lat},${cCoords.lng}&travelmode=driving`;
                      window.open(gmapsUrl, '_blank');
                    }}
                    className="p-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                    title={isAr ? 'فتح في تطبيق الخرائط الخارجي' : 'Open External Maps'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isAr ? 'خرائط' : 'Maps'}</span>
                  </button>

                  {/* Cancel Route */}
                  <button
                    type="button"
                    onClick={handleClearRoute}
                    className="p-1.5 px-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                    title={isAr ? 'إلغاء المسار' : 'Clear Route'}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إلغاء' : 'Clear'}</span>
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleCenterOnUser}
                disabled={isLocatingUser}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm shadow-2xl border-2 transition-all cursor-pointer active:scale-95 bg-blue-600 hover:bg-blue-500 text-white border-blue-400 pointer-events-auto shrink-0 ml-auto"
                title={isAr ? 'توسيط موقعي' : 'My Location'}
              >
                <Crosshair className={`w-4 h-4 ${isLocatingUser ? 'animate-spin text-amber-300' : 'text-white'}`} />
                <span>{isLocatingUser ? (isAr ? 'جاري التحديد...' : 'Locating...') : (isAr ? 'موقعي' : 'My Location')}</span>
              </button>
            </div>

            {/* Floating Card for Selected Customer (فقط اسمه ورقمه والقسط مع زر مسار إلى) */}
            {selectedCustomer && (
              <div className="absolute bottom-16 left-3 right-3 sm:bottom-auto sm:top-28 sm:left-3 sm:right-auto sm:w-80 z-30 bg-slate-900/95 backdrop-blur-md border-2 border-emerald-500/90 rounded-3xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-top-4 duration-200">
                {/* 1. Header: Customer Name (اسمه) & Close */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></span>
                    <h3 className="text-base font-black text-white truncate">
                      {selectedCustomer.customerName}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 2. Customer Phone (رقمه) */}
                <div className="py-2.5 space-y-2">
                  <div className="flex items-center justify-between bg-slate-800/90 px-3 py-2 rounded-2xl border border-slate-700/70">
                    <span className="text-xs text-slate-400 font-bold">{isAr ? 'الهاتف:' : 'Phone:'}</span>
                    {selectedCustomer.customerPhone ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${selectedCustomer.customerPhone}`}
                          className="text-xs font-black text-emerald-400 hover:underline flex items-center gap-1 dir-ltr"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{selectedCustomer.customerPhone}</span>
                        </a>
                        <a
                          href={`https://wa.me/${selectedCustomer.customerPhone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors shadow-xs"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 font-bold">{isAr ? 'بدون رقم' : 'No phone'}</span>
                    )}
                  </div>

                  {/* 3. Installment info (القسط والمتبقي) */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-800/90 rounded-2xl border border-slate-700/70">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">
                        {isAr ? 'القسط اليومي' : 'Daily'}
                      </span>
                      <span className="text-xs font-black text-slate-100">
                        {(selectedCustomer.dailyInstallment || 0).toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">
                        {isAr ? 'المبلغ المتبقي' : 'Remaining'}
                      </span>
                      <span className={`text-xs font-black ${selectedCustomer.remainingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {selectedCustomer.remainingBalance.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Action Buttons: زر "مسار إلى" + زر "عرض التسديدات" + زر "حذف الموقع للمدير فقط" */}
                <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-800">
                  {selectedCustomer.latitude && selectedCustomer.longitude && Number(selectedCustomer.latitude) !== 0 ? (
                    <button
                      type="button"
                      onClick={() => handleDrawRouteToCustomer(selectedCustomer)}
                      disabled={isLoadingRoute}
                      className="flex-1 py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/25 ring-2 ring-blue-400/50 active:scale-95 cursor-pointer"
                    >
                      <Navigation className={`w-4 h-4 text-blue-200 ${isLoadingRoute ? 'animate-spin' : ''}`} />
                      <span>{isLoadingRoute ? (isAr ? 'جاري رسم مسار الشوارع...' : 'Routing...') : (isAr ? '🚗 رسم مسار الشوارع على الخريطة' : '🚗 In-App Street Route')}</span>
                    </button>
                  ) : null}

                  {onViewCustomerPayments && (
                    <button
                      type="button"
                      onClick={() => onViewCustomerPayments(selectedCustomer)}
                      className="py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer shadow-md"
                      title={isAr ? 'عرض سجل تسديدات هذا الزبون للجميع' : 'View payments history'}
                    >
                      <Receipt className="w-4 h-4" />
                      <span>{isAr ? 'عرض التسديدات' : 'Payments'}</span>
                    </button>
                  )}

                  {isAdmin && selectedCustomer.latitude && selectedCustomer.longitude && Number(selectedCustomer.latitude) !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLocation(selectedCustomer.id)}
                      disabled={isUpdatingLocation}
                      className="py-2.5 px-3 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/40 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer"
                      title={isAr ? 'حذف إحداثيات موقع هذا الزبون (للمدير فقط)' : 'Delete location (Admin only)'}
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>{isAr ? 'حذف الموقع' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right/Left Side Drawer: Customers List */}
          {isSidebarOpen && (
            <div className="w-full sm:w-80 md:w-96 h-full bg-slate-900 border-r sm:border-l border-slate-800 flex flex-col z-20 shrink-0">
              <div className="p-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-200">
                    {isAr ? 'قائمة الزبائن' : 'Customer List'}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    {filteredContracts.length} {isAr ? 'زبون معروض' : 'shown'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>

              {/* Active Search Filter in Drawer */}
              {searchQuery ? (
                <div className="p-2 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-300 min-w-0">
                    <Search className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-400 shrink-0">{isAr ? 'البحث النشط:' : 'Filter:'}</span>
                    <span className="font-bold text-white bg-slate-700/80 px-2 py-0.5 rounded-lg truncate max-w-[140px]">{searchQuery}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title={isAr ? 'مسح البحث' : 'Clear'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}

              {/* Scrollable Customer Cards */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {filteredContracts.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-bold">
                      {isAr ? 'لا توجد نتائج تطابق التصفية' : 'No customers match the filter'}
                    </p>
                  </div>
                ) : (
                  filteredContracts.map((contract) => {
                    const hasLocation = contract.latitude != null && contract.longitude != null && Number(contract.latitude) !== 0;
                    const isSelected = selectedCustomer?.id === contract.id;

                    return (
                      <div
                        key={contract.id}
                        onClick={() => {
                          if (hasLocation) {
                            handleFlyToCustomer(contract);
                            setIsSidebarOpen(false); // Close sidebar on mobile to view map directly
                          } else {
                            setSelectedCustomer(contract);
                          }
                        }}
                        className={`p-3 rounded-2xl border transition-all text-right cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                            : 'bg-slate-850/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/90'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-black text-white truncate">
                              {contract.customerName}
                            </h5>
                            <p className="text-[11px] text-slate-400 font-semibold truncate mt-0.5">
                              {contract.customerPhone || (isAr ? 'بدون هاتف' : 'No phone')}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                {contract.listName || (isAr ? 'عامة' : 'List')}
                              </span>
                              <span className={`text-[10px] font-bold ${contract.remainingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {contract.remainingBalance.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                              </span>
                            </div>
                          </div>

                          {/* Location Indicator & Quick Delete (للمدير فقط) */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            {onViewCustomerPayments && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewCustomerPayments(contract);
                                }}
                                className="p-1.5 rounded-xl bg-sky-950/60 hover:bg-sky-900 text-sky-300 border border-sky-500/40 transition-colors cursor-pointer"
                                title={isAr ? 'عرض التسديدات' : 'View payments'}
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasLocation ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDrawRouteToCustomer(contract);
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center gap-1 shadow-md shadow-blue-500/25 transition-all active:scale-95 cursor-pointer ring-1 ring-blue-400/50"
                                  title={isAr ? 'رسم مسار الشوارع لهذا الزبون على الخريطة' : 'Draw street route'}
                                >
                                  <Navigation className="w-3.5 h-3.5 text-blue-200" />
                                  <span>{isAr ? 'مسار 🚗' : 'Route 🚗'}</span>
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveLocation(contract.id);
                                    }}
                                    disabled={isUpdatingLocation}
                                    className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer"
                                    title={isAr ? 'حذف موقع هذا الزبون (للمدير فقط)' : 'Delete location (Admin only)'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <span className="px-2.5 py-1 rounded-xl bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                                  <Navigation className="w-3 h-3" />
                                  <span>{isAr ? 'الخريطة' : 'Map'}</span>
                                </span>
                              </>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-bold">
                                {isAr ? 'بدون موقع' : 'No GPS'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
