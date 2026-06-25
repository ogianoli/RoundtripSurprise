export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type StopKind =
  | 'arrival'
  | 'stay'
  | 'food'
  | 'activity'
  | 'transfer'
  | 'memory'
  | 'surprise';

export type TravelMode = 'walk' | 'taxi' | 'flight' | 'boat' | 'train' | 'car' | 'metro' | 'scooter';

export type RevealMode = 'manual' | 'time' | 'location' | 'after_stop';

export type SurpriseVisibility = 'hidden' | 'teaser' | 'revealed';

export type MapVisibility = 'marker' | 'route-only';

export type MapCategory =
  | 'general'
  | 'stay'
  | 'hike'
  | 'beach'
  | 'food'
  | 'activity'
  | 'travel';

export type PlaceRecommendation = {
  id: string;
  title: string;
  notes?: string;
  url?: string;
  coordinates?: Coordinates;
  sourceLabel?: string;
  sourceProvider?: string;
};

export type PlaceRecommendationGroup = {
  id: string;
  title: string;
  icon: string;
  items: PlaceRecommendation[];
};

export type TripStop = {
  id: string;
  title: string;
  city: string;
  country: string;
  startsAt: string;
  endsAt?: string;
  coordinates: Coordinates;
  kind: StopKind;
  notes: string;
  travelModeFromPrevious?: TravelMode;
  bookingReference?: string;
  address?: string;
  photos?: string[];
  links?: Array<{
    label: string;
    url: string;
  }>;
  recommendations?: PlaceRecommendationGroup[];
  routeCoordinates?: Coordinates[];
  mapVisibility?: MapVisibility;
  mapCategory?: MapCategory;
  placeId?: string;
  coverColor: string;
};

export type TripDocument = {
  id: string;
  name: string;
  uri: string;
  linkedStopId: string;
  mimeType?: string;
  addedAt: string;
};

export type TripTodo = {
  id: string;
  title: string;
  notes: string;
  dueDate?: string;
  linkedStopId?: string;
  done: boolean;
};

export type TripDay = {
  id: string;
  date: string;
  title: string;
  summary: string;
  stops: string[];
};

export type SurpriseStop = {
  id: string;
  title: string;
  city: string;
  country: string;
  coordinates?: Coordinates;
  anchorStopId?: string;
  message: string;
  teaser?: string;
  revealMode: RevealMode;
  revealAt?: string;
  revealRadiusMeters?: number;
  afterStopId?: string;
  notifyOnReveal?: boolean;
  visibility: SurpriseVisibility;
  createdBy: 'owner';
  createdAt: string;
};

export type RevealedSurprise = SurpriseStop & {
  currentVisibility: Exclude<SurpriseVisibility, 'hidden'>;
};

export type Trip = {
  id: string;
  title: string;
  travelers: string[];
  startsAt: string;
  endsAt: string;
  homeTimezone: string;
  stops: TripStop[];
  days: TripDay[];
  todos: TripTodo[];
  documents: TripDocument[];
  surprises: SurpriseStop[];
};

export type RevealContext = {
  ownerMode: boolean;
  now: Date;
  currentLocation?: Coordinates;
  completedStopIds?: string[];
};
