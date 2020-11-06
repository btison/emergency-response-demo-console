import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Incident } from '../models/incident';
import { Responder } from '../models/responder';
import { Shelter } from '../models/shelter';
import { LineLayout, LinePaint, LngLatBoundsLike, FitBoundsOptions } from 'mapbox-gl';
import { AppUtil } from '../app-util';
import { ResponderService } from '../services/responder.service';
import { IncidentService } from '../services/incident.service';
import { Mission } from '../models/mission';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapComponent implements OnInit {
  @Input() responders: Responder[];
  @Input() incidents: Incident[];
  @Input() shelters: Shelter[];
  @Input() missions: Mission[];

  center: number[] = AppUtil.isMobile() ? [-77.886765, 34.139921] : [-77.886765, 34.158808];
  accessToken: string = window['_env'].accessToken;

  pickupData: GeoJSON.FeatureCollection<GeoJSON.LineString> = AppUtil.initGeoJson();
  deliverData: GeoJSON.FeatureCollection<GeoJSON.LineString> = AppUtil.initGeoJson();
  zoom: number[] = [AppUtil.isMobile() ? 10 : 10.5];

  bounds: LngLatBoundsLike;
  boundsOptions: FitBoundsOptions = {
    padding: 50
  };

  lineLayout: LineLayout = {
    'line-join': 'round',
    'line-cap': 'round'
  };

  readonly GREY = '#a4b7c1';
  readonly YELLOW = '#ffc107';
  readonly BLUE = '#20a8d8';
  readonly RED = '#f86c6b';
  readonly GREEN = '#4dbd74';

  pickupPaint: LinePaint = {
    'line-color': this.YELLOW,
    'line-width': 8
  };

  deliverPaint: LinePaint = {
    'line-color': this.BLUE,
    'line-width': 8
  };

  shelterStyle: any = {
    'background-image': 'url(assets/img/circle-shelter-hospital-colored.svg)'
  };

  constructor(public responderService: ResponderService, public incidentService: IncidentService) { }

  get currentIncidents(): Incident[] {
    return this.incidents.filter(i => i.status !== 'RESCUED');
  }

  get activeResponders(): Responder[] {
    return this.responders;
  }

  markerClick(lngLat: number[]): void {
    this.center = lngLat;
  }

  // icons colored with coreui hex codes from https://iconscout.com/icon/location-62
  getIncidentIcon(incident: Incident): string {
    return !incident.status || incident.status === 'REPORTED' ? 'marker-incident-helpme-colored.svg' : 'marker-incident-helpassigned-colored2.svg';
  }

  getResponderIcon(person: boolean): string {
    return (person ? 'circle-responder-boat-colored.svg' : 'circle-responder-boat-simulated-colored.svg');
  }

  getResponderMission(responder: Responder) {
    return this.missions.find(m => m.responderId === responder.id && m.status !== 'COMPLETED');
  }

  getIncidentMission(incident: Incident) {
    return this.missions.find(m => m.incidentId === incident.id);
  }

  onResponderPopup(responder: Responder): void {
    const mission = this.getResponderMission(responder);
    if (!mission) {
      return;
    }
    this.onPopup(mission);
  }

  onIncidentPopup(incident: Incident): void {
    const mission = this.getIncidentMission(incident);
    if (!mission) {
      return;
    }
    this.onPopup(mission);
  }

  public onPopup(mission: Mission): void {
    if (!mission || mission.status === 'COMPLETED') {
      return;
    }

    this.pickupData.features[0].geometry.coordinates = [];
    this.pickupData = { ...this.pickupData };
    this.deliverData.features[0].geometry.coordinates = [];
    this.deliverData = { ...this.deliverData };
    const missionRoute = AppUtil.getRoute(mission.id, mission.steps);
    if (!missionRoute) {
      return;
    }

    this.pickupData.features[0].geometry.coordinates = missionRoute.pickupRoute;
    this.deliverData.features[0].geometry.coordinates = missionRoute.deliverRoute;
    this.pickupData = { ...this.pickupData };
    this.deliverData = { ...this.deliverData };
    this.bounds = AppUtil.getBounds(missionRoute.pickupRoute.concat(missionRoute.deliverRoute));
  }

  ngOnInit() {
  }
}
