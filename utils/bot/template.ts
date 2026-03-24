export namespace Template {
  export enum Color {
    GREEN = 'GREEN',
    YELLOW = 'YELLOW',
    RED = 'RED',
    BLACK = 'BLACK',
  }

  function getEmojiFromColor(color: Color): string {
    switch (color) {
      case Color.GREEN:
        return '🟢';
      case Color.YELLOW:
        return '🟡';
      case Color.RED:
        return '🔴';
      case Color.BLACK:
        return '⚫';
      default:
        return '❓';
    }
  }

  /*
     Example:
        color: GREEN
        degrees: "< 31 °C"
        location: "CDA"
        workRestCycle: "45/15"
        remarks: "Train as usual, follow TSR"

        color: YELLOW
        degrees: "31.0 - 31.9 °C"
        location: "CDA"
        workRestCycle: "30/15"
        remarks: "Train w/caution, increase supervision"
    */

  interface WGBTArmsTemplate {
    color: Color;
    location: 'CDA' | 'HTTC';
    degrees: string;
    workRestCycle: string;
    remarks: string;
  }

  export function getTemplateFromColor(
    color: Color,
    location: 'CDA' | 'HTTC',
  ): WGBTArmsTemplate | null {
    switch (color) {
      case Color.GREEN:
        return location === 'CDA' ? Template.CDA_GREEN : Template.HTTC_GREEN;
      case Color.YELLOW:
        return location === 'CDA' ? Template.CDA_YELLOW : Template.HTTC_YELLOW;
      default:
        return null;
    }
  }

  //   TODO: Add red and black templates when thresholds are confirmed by ARMS. For now, only green and yellow templates are defined based on the current ARMS guidelines.

  export const CDA_GREEN: WGBTArmsTemplate = {
    color: Color.GREEN,
    location: 'CDA',
    degrees: '< 31 °C',
    workRestCycle: '45/15',
    remarks: 'Train as usual, follow TSR',
  };

  export const CDA_YELLOW: WGBTArmsTemplate = {
    color: Color.YELLOW,
    location: 'CDA',
    degrees: '31.0 - 31.9 °C',
    workRestCycle: '30/15',
    remarks: 'Train w/caution, increase supervision',
  };

  export const HTTC_GREEN: WGBTArmsTemplate = {
    color: Color.GREEN,
    location: 'HTTC',
    degrees: '< 30 °C',
    workRestCycle: '45/15',
    remarks: 'Train as usual, follow TSR',
  };

  export const HTTC_YELLOW: WGBTArmsTemplate = {
    color: Color.YELLOW,
    location: 'HTTC',
    degrees: '30.0 - 30.9 °C',
    workRestCycle: '30/15',
    remarks: 'Train w/caution, increase supervision',
  };
}
