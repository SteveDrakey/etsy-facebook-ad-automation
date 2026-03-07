declare module "facebook-nodejs-business-sdk" {
  class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
    setDebug(debug: boolean): void;
  }

  class AbstractCrudObject {
    _data: Record<string, any>;
    get(fields: string[]): Promise<this>;
  }

  class Page extends AbstractCrudObject {
    static Fields: Record<string, string>;
    constructor(id: string);
    createPhoto(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
    createFeed(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
  }

  class AdAccount extends AbstractCrudObject {
    static Fields: Record<string, string>;
    constructor(id: string);
    createCampaign(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
    createAdSet(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
    createAdCreative(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
    createAd(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
    createAdImage(fields: string[], params: Record<string, any>): Promise<AbstractCrudObject>;
  }

  class Campaign extends AbstractCrudObject {
    static Fields: Record<string, string>;
    static Objective: Record<string, string>;
    static Status: Record<string, string>;
  }

  class AdSet extends AbstractCrudObject {
    static Fields: Record<string, string>;
  }

  class AdCreative extends AbstractCrudObject {
    static Fields: Record<string, string>;
  }

  class Ad extends AbstractCrudObject {
    static Fields: Record<string, string>;
    static Status: Record<string, string>;
  }

  const _default: {
    FacebookAdsApi: typeof FacebookAdsApi;
    Page: typeof Page;
    AdAccount: typeof AdAccount;
    Campaign: typeof Campaign;
    AdSet: typeof AdSet;
    AdCreative: typeof AdCreative;
    Ad: typeof Ad;
  };

  export default _default;
}
